// The contract for other apps (references/remote.md): session.json carries `schema`, console.json `external_actions`, an
// action's `source` is kept (allowlisted) on the step's `sent`, the feed line and the closed decision, and `wait` applies
// a line another app appended in BOTH modes, while a line the server already applied on POST is applied once only.
// Contract v2 (external_actions 2): a strict superset of v1 that adds what a phone needs to run a whole film; every new action is validated
// against the session as it is now, and a refusal is listed in rejected.json and never reaches the director.
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
    ok("remote: session.json carries schema 1 and console.json external_actions 2 (headless)", J("session.json").schema === 1 && J("console.json").external_actions === 2 && J("console.json").headless === true, JSON.stringify(J("console.json")));
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
    ok("remote: an older headless console.json is given external_actions on the next command", J("console.json").external_actions === 2 && J("console.json").headless === true);
  }

  // ---- contract v2: brief submit, decide, styleframes, ask answers (incl. tool-ready), a chat note in Studio's shape
  {
    const { run, c, J, append, wait } = mk("remote-v2", { ...plain, RASANAI_CONSOLE_HEADLESS: "1" });
    let n = 0;
    const act = (o) => { const id = `v2-${++n}`; append({ id, ts: "2026-01-01T00:00:00.000Z", source: "squeak-phone", note: "", ...o }); return id; };
    const rejected = () => { try { return J("rejected.json"); } catch { return []; } };
    const why = (id) => (rejected().find((r) => r.id === id) || {}).error;
    // a valid note after the bad lines: `wait` consumes them in order, rejects each bad one and returns the first good one
    const through = (...ids) => { const sentinel = act({ step: "story", type: "note", value: null, note: "after" }); const got = wait(); return got.id === sentinel && ids.every((i) => !!why(i)); };
    const briefFields = { length_s: 45, kind: "launch film", subject: "Squeak", aspect: "16:9", destination: "the website", narration: true, tone: "calm" };
    const pushBrief = () => c("push", "--run", run, "--step", "brief", "--data", JSON.stringify({ fields: briefFields }));
    const catalog = JSON.parse(fs.readFileSync(path.join(path.dirname(CONSOLE), "..", "library", "formats.json"), "utf8"));
    const ready = catalog.options.find((o) => o.status === "ready"), soon = catalog.options.find((o) => o.status === "soon");

    pushBrief();
    ok("remote v2: a nested brief {fields, format} is applied and flattened to the shape Studio sends (kind from the format)", (() => {
      const id = act({ step: "brief", type: "submit", value: { fields: { length_s: 30, subject: "Hi", aspect: "9:16", use_brand: true, tone: "bold" }, format: { tile: ready.tile, option: ready.id, scope: "universal" } } });
      const a = wait("brief"), sent = J("session.json").steps.brief.sent;
      return a.id === id && a.value.length_s === 30 && a.value.use_brand === true && a.value.tone === "bold" && a.value.format.option === ready.id && a.value.format.scope === "universal" && a.value.kind === ready.kind && !("fields" in a.value) && sent.source === "squeak-phone" && sent.value.format.tile === ready.tile;
    })(), JSON.stringify(J("session.json").steps.brief.sent));
    pushBrief();
    ok("remote: Studio's flat brief submit (with the director's own extra field) is applied too, and a Studio line may carry anything", (() => {
      const a1 = act({ step: "brief", type: "submit", value: { ...briefFields, tone: "x" } });
      const w1 = wait("brief");
      pushBrief();
      const a2 = act({ step: "brief", type: "submit", value: { subject: "x", surprise: 1 }, source: "studio" });
      const w2 = wait("brief");
      return w1.id === a1 && w2.id === a2 && w2.value.surprise === 1;
    })());
    pushBrief();
    const bad = {
      unknown: act({ step: "brief", type: "submit", value: { fields: { subject: "x", color: "red" } } }),
      type: act({ step: "brief", type: "submit", value: { length_s: "30", subject: "x" } }),
      low: act({ step: "brief", type: "submit", value: { length_s: 3 } }),
      high: act({ step: "brief", type: "submit", value: { length_s: 601 } }),
      aspect: act({ step: "brief", type: "submit", value: { aspect: "4:3" } }),
      nofmt: act({ step: "brief", type: "submit", value: { subject: "x", format: { tile: ready.tile, option: "no-such-format" } } }),
      tile: act({ step: "brief", type: "submit", value: { subject: "x", format: { tile: "no-such-tile", option: ready.id } } }),
      scope: act({ step: "brief", type: "submit", value: { subject: "x", format: { tile: ready.tile, option: ready.id, scope: "everything" } } }),
      extra: act({ step: "brief", type: "submit", value: { fields: { subject: "x" }, other: 1 } }),
      shape: act({ step: "brief", type: "submit", value: "make it" }),
    };
    if (soon) bad.soon = act({ step: "brief", type: "submit", value: { subject: "x", format: { tile: soon.tile, option: soon.id } } });
    ok("remote v2: a brief submit with an unknown field, a wrong type, a length or aspect out of range, or a format the catalog lacks (or marks coming soon) is refused with its reason", through(...Object.values(bad)) && /unknown brief field: color/.test(why(bad.unknown)) && /wrong type: length_s/.test(why(bad.type)) && /5 to 600/.test(why(bad.low)) && /5 to 600/.test(why(bad.high)) && /aspect/.test(why(bad.aspect)) && /not in the catalog/.test(why(bad.nofmt)) && /not in the catalog/.test(why(bad.tile)) && /scope/.test(why(bad.scope)) && /unknown brief field: other/.test(why(bad.extra)) && (!soon || /not available yet/.test(why(bad.soon))), JSON.stringify(rejected().map((r) => r.error)));
    ok("remote v2: a brief that is not waiting refuses a second submit", (() => {
      c("push", "--run", run, "--step", "brief", "--status", "done", "--data", JSON.stringify({ fields: briefFields }));
      const id = act({ step: "brief", type: "submit", value: { subject: "again" } });
      return through(id) && /not waiting/.test(why(id));
    })());

    // decide (the per-step "you decide") and decide-rest
    c("push", "--run", run, "--step", "story", "--data", JSON.stringify(STORY));
    const d1 = act({ step: "story", type: "decide", value: null });
    const dw = wait("story");
    ok("remote v2: decide on a waiting step is applied and named in the feed", dw.id === d1 && J("session.json").activity.some((x) => x.msg === "You (iPhone): Claude decides the story"), JSON.stringify(J("session.json").activity.at(-1)));
    const d2 = act({ step: "look", type: "decide", value: null }), d3 = act({ step: "story", type: "decide", value: "yes" }), d4 = act({ step: "brief", type: "decide-rest", value: null }), d5 = act({ step: "*", type: "decide", value: null });
    ok("remote v2: decide on a step that is not waiting, with a value, decide-rest on a step, or decide on * is refused", through(d2, d3, d4, d5), JSON.stringify(rejected().slice(-4)));
    const d6 = act({ step: "*", type: "decide-rest", value: null });
    ok("remote v2: decide-rest on step * is applied", wait().id === d6 && !!J("session.json").decide_rest);

    // styleframes: approve, comment {frame, text}, redo {ids, note}
    c("push", "--run", run, "--step", "styleframes", "--data", JSON.stringify({ frames: [{ id: "f1", image: "frames/f1.png" }, { id: "f2", image: "frames/f2.png" }], sheet: "frames/sheet.png" }));
    const sf1 = act({ step: "styleframes", type: "comment", value: { frame: "f1", text: "warmer" } });
    const sw1 = wait("styleframes"), cm = J("session.json").comments.at(-1);
    ok("remote v2: a styleframes comment {frame, text} becomes an open note on that frame, in the v1 shape", sw1.id === sf1 && sw1.value.scene === "f1" && sw1.value.scope === "scene" && sw1.note === "warmer" && cm.scene === "f1" && cm.text === "warmer" && cm.state === "open" && cm.step === "styleframes", JSON.stringify([sw1, cm]));
    const sf2 = act({ step: "styleframes", type: "redo", value: { ids: ["f1", "f2", "f1"], note: "less blue" } });
    const sw2 = wait("styleframes"), s2 = J("session.json");
    ok("remote v2: a styleframes redo {ids, note} names the frames and keeps the note in the thread (ids deduplicated)", sw2.id === sf2 && sw2.value.ids.join() === "f1,f2" && s2.activity.at(-1).msg === "You (iPhone): asked to redo the style frames: frames f1, f2" && s2.steps.styleframes.thread.at(-1).text === "less blue", JSON.stringify(s2.activity.at(-1)));
    const sf3 = act({ step: "styleframes", type: "approve", value: null });
    ok("remote v2: styleframes approve is applied", wait("styleframes").id === sf3);
    c("push", "--run", run, "--step", "styleframes", "--data", JSON.stringify({ frames: [{ id: "f1", image: "frames/f1.png" }] }));
    const sb = [act({ step: "styleframes", type: "comment", value: { frame: "zz", text: "x" } }), act({ step: "styleframes", type: "comment", value: { frame: "f1", text: "" } }), act({ step: "styleframes", type: "redo", value: { ids: ["f1", "zz"], note: "x" } }), act({ step: "styleframes", type: "redo", value: { ids: [], note: "x" } }), act({ step: "styleframes", type: "approve", value: { yes: 1 } })];
    ok("remote v2: a styleframes comment or redo naming a frame that is not there, an empty comment or redo, or an approve with a value is refused", through(...sb), JSON.stringify(rejected().slice(-5)));

    // ask answers, including Studio's `tool-ready:<tool>`
    c("ask", "--run", run, "--question", "Rasan needs ffmpeg", "--options", JSON.stringify([{ id: "install-tool:ffmpeg", label: "Install for me" }, { id: "skip-tool:ffmpeg", label: "Continue without it" }]));
    const ask = J("session.json").ask;
    const ab = [act({ step: ask.step, type: "answer", value: { ask: "nope", choice: "skip-tool:ffmpeg", text: "" } }), act({ step: ask.step, type: "answer", value: { ask: ask.id, choice: "mystery", text: "" } }), act({ step: ask.step, type: "answer", value: { ask: ask.id, choice: "tool-ready:hyperframes", text: "" } }), act({ step: ask.step, type: "answer", value: { ask: ask.id, choice: null, text: "" } })];
    ok("remote v2: an answer to another question, an option the ask lacks, tool-ready for a tool it did not offer, or no choice and no text is refused", through(...ab), JSON.stringify(rejected().slice(-4)));
    const aok = act({ step: ask.step, type: "answer", value: { ask: ask.id, choice: "tool-ready:ffmpeg", text: "Installed." } });
    const aw = wait();
    ok("remote v2: tool-ready:<tool> answers an ask that offered install-tool:<tool>", aw.id === aok && J("session.json").ask.answered.choice === "tool-ready:ffmpeg", JSON.stringify(J("session.json").ask));
    const again = act({ step: ask.step, type: "answer", value: { ask: ask.id, choice: "skip-tool:ffmpeg", text: "" } });
    ok("remote v2: the same question cannot be answered twice", through(again) && /no open question/.test(why(again)));

    // chat: a note whose value.chat is Studio's shape, on the current step
    c("push", "--run", run, "--step", "look", "--data", JSON.stringify({ styles: [{ id: "bold", label: "Bold", name: "Ledger" }] }));
    const chat = (over = {}, step = "look") => ({ step, type: "note", note: "why this font?", value: { chat: { rules: "Answer with console.mjs reply in at most 3 sentences.", max_sentences: 3, max_tool_calls: 3, context: { step: "look", looking_at: "Ledger", recent_events: ["a", "b"] }, ...over } } });
    const ch1 = act(chat());
    const cw = wait("look"), sl = J("session.json").steps.look;
    ok("remote v2: a chat note in Studio's shape is applied on the current step (thread line, value.chat handed to the director)", cw.id === ch1 && cw.value.chat.max_sentences === 3 && cw.value.chat.context.looking_at === "Ledger" && sl.thread.at(-1).who === "you" && sl.thread.at(-1).text === "why this font?" && sl.sent.type === "note", JSON.stringify(sl.thread));
    c("push", "--run", run, "--step", "look", "--data", JSON.stringify({ styles: [{ id: "bold", label: "Bold", name: "Ledger" }] }));
    const cb = [act(chat({ extra: 1 })), act(chat({ max_sentences: 99 })), act(chat({ rules: "" })), act(chat({ context: { step: "nonsense" } })), act(chat({ context: { step: "look", mood: "x" } })), act(chat({ context: { step: "look", recent_events: ["1", "2", "3", "4", "5", "6"] } })), act(chat({}, "story")), act({ ...chat(), note: "" }), act({ step: "look", type: "note", note: "hi", value: { chat: {}, more: 1 } }), act({ step: "look", type: "note", note: "hi", value: "text" })];
    ok("remote v2: a chat note with an unknown key, a limit out of range, empty rules, a bad context, too many events, a step that is not current, no text or a different value shape is refused", through(...cb), JSON.stringify(rejected().slice(-10).map((r) => r.error)));
    // the director's reply lands on the same thread, ordered by t, with the user's line as who:"you"
    c("reply", "--run", run, "--step", "look", "--message", "Because it reads well small.");
    const th = J("session.json").steps.look.thread;
    ok("remote v2: console.mjs reply appends {who:'claude', text, t} to steps.<step>.thread after the user's own line", th.at(-1).who === "claude" && th.at(-1).text === "Because it reads well small." && !!th.at(-1).t && th.some((m) => m.who === "you" && m.text === "why this font?") && Date.parse(th.at(-1).t) >= Date.parse(th.find((m) => m.who === "you").t), JSON.stringify(th));
    ok("remote v2: no lock is left behind", !fs.existsSync(path.join(run, "actions.lock")) && !fs.existsSync(path.join(run, "session.lock")));
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
      ok("remote: console.json advertises external_actions 2 in server mode", J("console.json").external_actions === 2 && !!J("console.json").pid, JSON.stringify(J("console.json")));
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
