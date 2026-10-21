// The contract for other apps (references/remote.md): session.json carries `schema`, console.json `external_actions`, an
// action's `source` is kept (allowlisted) on the step's `sent`, the feed line and the closed decision, and `wait` applies
// a line another app appended in BOTH modes, while a line the server already applied on POST is applied once only.
// export default async function ({ ok, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONSOLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "console.mjs");
const STORY = { stories: [{ id: "shoebox", title: "The shoebox wins" }, { id: "b", title: "B" }], recommended: "shoebox" };

export default async function ({ ok, tmp, env }) {
  const plain = { ...env };
  delete plain.RASANAI_CONSOLE_HEADLESS;
  const mk = (name, e) => {
    const run = path.join(tmp, name);
    const c = (...a) => spawnSync(process.execPath, [CONSOLE, ...a], { encoding: "utf8", env: e, cwd: tmp, timeout: 30000 });
    const J = (f) => JSON.parse(fs.readFileSync(path.join(run, f), "utf8"));
    const append = (a) => fs.appendFileSync(path.join(run, "actions.jsonl"), JSON.stringify(a) + "\n");
    const wait = (step) => { const r = c("wait", "--run", run, ...(step ? ["--step", step] : []), "--timeout", "10"); try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout + r.stderr }; } };
    return { run, c, J, append, wait };
  };

  // ---- headless (RasanAI Studio's runs)
  {
    const { run, c, J, append, wait } = mk("remote-headless", { ...plain, RASANAI_CONSOLE_HEADLESS: "1" });
    c("push", "--run", run, "--step", "story", "--data", JSON.stringify(STORY));
    ok("remote: session.json carries schema 1 and console.json external_actions 1 (headless)", J("session.json").schema === 1 && J("console.json").external_actions === 1 && J("console.json").headless === true, JSON.stringify(J("console.json")));
    append({ id: "sq1", ts: "2026-01-01T00:00:00.000Z", step: "story", type: "choose", value: "shoebox", note: "", source: "squeak-phone" });
    const a = wait("story");
    const s1 = J("session.json");
    ok("remote: wait keeps an allowlisted source and prints it", a.id === "sq1" && a.source === "squeak-phone", JSON.stringify(a));
    ok("remote: the step's sent carries source and via, and the feed says where you answered", s1.steps.story.sent.source === "squeak-phone" && s1.steps.story.sent.via === "iPhone" && s1.activity.at(-1).msg === "You (iPhone): picked the story: The shoebox wins" && s1.activity.at(-1).level === "you", JSON.stringify({ sent: s1.steps.story.sent, last: s1.activity.at(-1) }));
    c("push", "--run", run, "--step", "story", "--status", "done", "--data", JSON.stringify({ ...STORY, decision: "The shoebox wins" }));
    const s2 = J("session.json");
    ok("remote: closing the step keeps who answered and from where (by, by_source, by_via)", s2.steps.story.by === "user" && s2.steps.story.by_source === "squeak-phone" && s2.steps.story.by_via === "iPhone" && !s2.steps.story.sent, JSON.stringify(s2.steps.story));
    c("ask", "--run", run, "--question", "Include the logo?", "--options", '[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]');
    const ask = J("session.json").ask;
    append({ id: "sq2", ts: "2026-01-01T00:00:01.000Z", step: ask.step, type: "answer", value: { ask: ask.id, choice: "y", text: "" }, note: "", source: "squeak" });
    const w2 = wait();
    ok("remote: an answer from another app is applied and named in the feed", w2.id === "sq2" && J("session.json").ask.answered.choice === "y" && J("session.json").activity.at(-1).msg === "You (Squeak) answered: Yes", JSON.stringify(J("session.json").activity.at(-1)));
    c("push", "--run", run, "--step", "look", "--data", JSON.stringify({ styles: [{ id: "bold", label: "Bold", name: "Ledger" }] }));
    append({ id: "sq4", ts: "2026-01-01T00:00:02.000Z", step: "look", type: "note", value: null, note: "hm", source: "unknown-app" });
    append({ id: "sq3", ts: "2026-01-01T00:00:03.000Z", step: "look", type: "choose", value: "bold", note: "", source: "Evil Corp" });
    const w3 = wait("look");
    const w4 = wait("look");
    const s3 = J("session.json");
    ok("remote: a source outside the allowlist is read as console (no label, no via)", w3.source === "console" && w4.source === "console" && !("via" in s3.steps.look.sent) && s3.activity.some((x) => x.msg === "You: picked the look: Bold") && s3.activity.some((x) => x.msg === 'You: Note: "hm"'), JSON.stringify([w3, w4]));
    c("push", "--run", run, "--step", "look", "--status", "done", "--data", JSON.stringify({ decision: "Ledger" }));
    ok("remote: a decision made on the page carries no via", J("session.json").steps.look.by === "user" && !J("session.json").steps.look.by_via);
    // a run whose console.json predates the flag gets it on the next command
    const cj = path.join(run, "console.json");
    const { external_actions, ...old } = J("console.json");
    fs.writeFileSync(cj, JSON.stringify(old));
    c("activity", "--run", run, "--message", "x");
    ok("remote: an older headless console.json is given external_actions on the next command", J("console.json").external_actions === 1 && J("console.json").headless === true);
  }

  // ---- phone proxies: a push of render/animatic with a video makes a small H.264 copy in the background and adds `proxy`
  {
    const { run, c, J } = mk("remote-proxy", { ...plain, RASANAI_CONSOLE_HEADLESS: "1" });
    const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
    if (ff(["-version"]).error) console.log("note  remote: ffmpeg is not installed, phone proxy cases skipped");
    else {
      const dir = path.join(tmp, "renders");
      fs.mkdirSync(dir, { recursive: true });
      ff(["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=24", "-f", "lavfi", "-i", "sine=f=440", "-t", "2", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", path.join(dir, "draft.mp4")]);
      const push = (data, e) => spawnSync(process.execPath, [CONSOLE, "push", "--run", run, "--step", "render", "--data", JSON.stringify(data)], { encoding: "utf8", env: e || { ...plain, RASANAI_CONSOLE_HEADLESS: "1" }, cwd: tmp, timeout: 30000 });
      const t0 = Date.now();
      const p1 = push({ video: "renders/draft.mp4", version: 1 });
      const quick = Date.now() - t0;
      let proxy = null;
      for (let i = 0; i < 300 && !proxy; i++) { await new Promise((r) => setTimeout(r, 100)); try { proxy = J("session.json").steps.render.proxy || null; } catch {} }
      const probe = proxy ? spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", path.join(tmp, proxy)], { encoding: "utf8" }) : null;
      const streams = probe ? (JSON.parse(probe.stdout || "{}").streams || []) : [];
      const v = streams.find((x) => x.codec_type === "video"), a = streams.find((x) => x.codec_type === "audio");
      ok("remote: the push returns at once and the proxy lands in the run's phone/ folder, relative to the project", p1.status === 0 && quick < 10000 && !!proxy && !path.isAbsolute(proxy) && proxy.startsWith(path.relative(tmp, path.join(run, "phone"))), JSON.stringify({ status: p1.status, quick, proxy }));
      ok("remote: the proxy is H.264 540p with AAC", v && v.codec_name === "h264" && v.height === 540 && v.width === 960 && a && a.codec_name === "aac", JSON.stringify(streams));
      push({ video: "renders/draft.mp4", version: 1 });
      ok("remote: a re-push of the same video names the fresh proxy at once", J("session.json").steps.render.proxy === proxy);
      push({ video: "renders/missing.mp4", version: 2 });
      ok("remote: a video that is not there gets no proxy, and the old one is dropped", J("session.json").steps.render.proxy === undefined);
      push({ video: "renders/draft.mp4", version: 3 }, { ...plain, RASANAI_CONSOLE_HEADLESS: "1", RASANAI_PHONE_PROXY: "off" });
      ok("remote: RASANAI_PHONE_PROXY=off turns it off", J("session.json").steps.render.proxy === undefined);
      ok("remote: the render folder holds only the render", fs.readdirSync(dir).join(",") === "draft.mp4", fs.readdirSync(dir).join(","));
    }
  }

  // ---- server mode (the browser console): another app's line is applied by wait, the server's own POST only once
  {
    const { run, c, J, append, wait } = mk("remote-server", plain);
    const sv = c("serve", "--run", run, "--root", tmp);
    let url = "";
    try { url = JSON.parse(sv.stdout).url; } catch {}
    ok("remote: server console serves", !!url, sv.stdout + sv.stderr);
    if (!url) return;
    try {
      for (let i = 0; i < 50 && !fs.existsSync(path.join(run, "console.json")); i++) await new Promise((r) => setTimeout(r, 100));
      ok("remote: console.json advertises external_actions 1 in server mode", J("console.json").external_actions === 1 && !!J("console.json").pid, JSON.stringify(J("console.json")));
      c("push", "--run", run, "--step", "story", "--data", JSON.stringify(STORY));
      ok("remote: session.json carries schema 1 (server)", J("session.json").schema === 1);
      append({ id: "ext1", ts: "2026-01-01T00:00:00.000Z", step: "story", type: "choose", value: "shoebox", note: "shorter", source: "squeak-phone" });
      const a = wait("story");
      const s1 = J("session.json");
      ok("remote: server-mode wait applies a line another app appended (sent, feed, thread)", a.id === "ext1" && a.source === "squeak-phone" && s1.steps.story.sent && s1.steps.story.sent.name === "The shoebox wins" && s1.steps.story.sent.via === "iPhone" && s1.activity.some((x) => x.msg === "You (iPhone): picked the story: The shoebox wins") && s1.steps.story.thread.some((m) => m.who === "you" && m.text === "shorter") && J("consumed.json").includes("ext1"), JSON.stringify({ a, sent: s1.steps.story.sent }));
      // the page's own POST: applied by the server, consumed by wait, never applied a second time
      c("push", "--run", run, "--step", "story", "--data", JSON.stringify(STORY));
      const u = new URL(url);
      const page = await fetch(url).catch(() => null);
      const cookie = page ? (page.headers.get("set-cookie") || "").split(";")[0] : "";
      const post = await fetch(`${u.origin}/api/action`, { method: "POST", headers: { "content-type": "application/json", "x-rasa-token": u.searchParams.get("t"), cookie }, body: JSON.stringify({ step: "story", type: "choose", value: "b" }) });
      const pj = await post.json().catch(() => ({}));
      const line = fs.readFileSync(path.join(run, "actions.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.id === (pj.action && pj.action.id));
      const b = wait("story");
      const picked = J("session.json").activity.filter((x) => x.msg === "You: picked the story: B");
      ok("remote: a POST line is marked applied, delivered by wait, and applied once", post.status === 200 && line && line.applied === true && !("applied" in pj.action) && b.id === pj.action.id && b.value === "b" && !("applied" in b) && picked.length === 1, JSON.stringify({ line, b, picked: picked.length }));
      // a bad external line is rejected in server mode too, never delivered
      append({ id: "ext2", step: "nonsense", type: "choose", source: "squeak" });
      append({ id: "ext3", ts: "2026-01-01T00:00:05.000Z", step: "story", type: "note", value: null, note: "one more thing", source: "squeak" });
      const n = wait();
      ok("remote: server-mode wait rejects a bad external line and delivers the next", n.id === "ext3" && J("rejected.json").some((r) => r.id === "ext2") && J("session.json").activity.some((x) => x.msg === 'You (Squeak): Note: "one more thing"'), JSON.stringify(n));
      ok("remote: no lock is left behind", !fs.existsSync(path.join(run, "actions.lock")) && !fs.existsSync(path.join(run, "session.lock")));
    } finally {
      c("stop", "--run", run);
    }
  }
}
