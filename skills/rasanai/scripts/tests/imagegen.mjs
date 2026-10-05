// Tests for imagegen.mjs + lib/codex.mjs against a fake Codex. No network, no real Codex.
// export default async function ({ ok, node, tmp, env })  (selftest.mjs's helpers; node() runs a script of scripts/)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { findCodex, imageModels, loginStatus } from "../lib/codex.mjs";

export default async function ({ ok, node, tmp, env }) {
  const root = path.join(tmp, "imagegen-test");
  const codexHome = path.join(root, "codex-home"), generated = path.join(codexHome, "generated_images");
  const rec = path.join(root, "argv.jsonl"), tpl = path.join(root, "template.png");
  fs.mkdirSync(codexHome, { recursive: true });
  const mk = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1672x940:rate=1", "-frames:v", "1", tpl]);
  ok("imagegen: ffmpeg made the template picture", mk.status === 0 && fs.existsSync(tpl));
  fs.writeFileSync(path.join(codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-hidden", visibility: "hide", priority: 0 }, { slug: "gpt-bad", visibility: "list", priority: 1 }, { slug: "gpt-good", visibility: "list", priority: 2 }] }));

  // the fake codex: answers `login status`, rejects gpt-bad, records argv + stdin, writes a PNG into its session folder
  const fake = path.join(root, "codex");
  fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), E = process.env;
if (a[0] === "login") { if (E.FAKE_SIGNED_OUT) { console.error("Not logged in"); process.exit(1); } console.log("Logged in using ChatGPT"); process.exit(0); }
let stdin = ""; try { stdin = fs.readFileSync(0, "utf8"); } catch {}
const model = a[a.indexOf("-m") + 1];
const session = "sess-" + Math.random().toString(16).slice(2, 10);
fs.appendFileSync(E.FAKE_REC, JSON.stringify({ argv: a, stdin, model, session }) + "\\n");
console.log("OpenAI Codex v0 (research preview)\\nsession id: " + session);
if (model === "gpt-bad") { console.error('ERROR: {"detail":"The \\'gpt-bad\\' model is not supported when using Codex with a ChatGPT account."}'); process.exit(1); }
if (E.FAKE_FAIL) { console.error("ERROR: the image tool refused this request"); process.exit(1); }
if (E.FAKE_SLEEP) { setTimeout(() => {}, 60000); return; }
const dir = path.join(E.CODEX_HOME, "generated_images", session); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "exec-" + session + ".png"), fs.readFileSync(E.FAKE_PNG));
const m = stdin.match(/exactly this path: (\\S+)/);
if (E.FAKE_COPY && m) fs.copyFileSync(E.FAKE_PNG, m[1]);
console.log(m ? m[1] : "");
`);
  fs.chmodSync(fake, 0o755);

  const saved = {};
  const set = (kv) => { for (const [k, v] of Object.entries(kv)) { if (!(k in saved)) saved[k] = env[k]; if (v == null) delete env[k]; else env[k] = v; } };
  set({ RASANAI_CODEX_BIN: fake, CODEX_HOME: codexHome, RASANAI_HOME: path.join(root, "home"), FAKE_REC: rec, FAKE_PNG: tpl, RASANAI_IMAGEGEN: null, RASANAI_IMAGE_MODEL: null, FAKE_SIGNED_OUT: null, FAKE_FAIL: null, FAKE_COPY: null, FAKE_SLEEP: null });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const calls = () => (fs.existsSync(rec) ? fs.readFileSync(rec, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const size = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f], { encoding: "utf8" }); return r.stdout.trim(); };

  try {
    // lib/codex.mjs
    ok("imagegen: findCodex honours RASANAI_CODEX_BIN", findCodex(env) === fake);
    ok("imagegen: findCodex gives null for a bad RASANAI_CODEX_BIN", findCodex({ ...env, RASANAI_CODEX_BIN: path.join(root, "nope") }) === null);
    ok("imagegen: imageModels lists visible models by priority, then gpt-5.5", JSON.stringify(imageModels(env)) === JSON.stringify(["gpt-bad", "gpt-good", "gpt-5.5"]), JSON.stringify(imageModels(env)));
    ok("imagegen: imageModels puts RASANAI_IMAGE_MODEL first", imageModels({ ...env, RASANAI_IMAGE_MODEL: "gpt-x" })[0] === "gpt-x");
    const ls = loginStatus(fake, env);
    ok("imagegen: loginStatus reads ChatGPT sign-in", ls.signed_in && ls.auth === "chatgpt", JSON.stringify(ls));

    // status
    let r = node("imagegen.mjs", ["status"]);
    ok("imagegen: status ready", json(r).state === "ready" && json(r).auth === "chatgpt" && json(r).model === "gpt-bad", r.stdout + r.stderr);
    r = node("imagegen.mjs", ["status", "--kv"]);
    ok("imagegen: status --kv is one IMAGEGEN= line", /^IMAGEGEN=ready IMAGEGEN_MODEL=gpt-bad IMAGEGEN_CODEX=\S+\n$/.test(r.stdout), r.stdout);
    set({ RASANAI_IMAGEGEN: "off" });
    ok("imagegen: status off", json(node("imagegen.mjs", ["status"])).state === "off");
    set({ RASANAI_IMAGEGEN: null, RASANAI_CODEX_BIN: path.join(root, "missing"), PATH: "/usr/bin:/bin" });
    const nc = json(node("imagegen.mjs", ["status"]));
    ok("imagegen: status no-codex", nc.state === "no-codex" || nc.state === "ready" /* a real codex in ~/.local/bin is found only when the override is unset */ ? nc.state === "no-codex" : false, JSON.stringify(nc));
    set({ RASANAI_CODEX_BIN: fake, PATH: saved.PATH, FAKE_SIGNED_OUT: "1" });
    ok("imagegen: status signed-out", json(node("imagegen.mjs", ["status"])).state === "signed-out");
    set({ FAKE_SIGNED_OUT: null });

    // unavailable -> exit 3
    set({ RASANAI_IMAGEGEN: "off" });
    r = node("imagegen.mjs", ["generate", "--prompt", "a thing", "--out", path.join(root, "off.png")]);
    ok("imagegen: generate while off exits 3 and says why", r.status === 3 && json(r).state === "off" && /PROBLEM/.test(r.stderr), `${r.status} ${r.stderr}`);
    set({ RASANAI_IMAGEGEN: null });

    // generate: model fallback, normalise, sidecar, raw, remembered model
    const out1 = path.join(root, "out", "a.png");
    r = node("imagegen.mjs", ["generate", "--prompt", "An empty pottery wheel at dawn", "--aspect", "16:9", "--out", out1]);
    const g = json(r);
    ok("imagegen: generate succeeds after the first model is rejected", r.status === 0 && g.ok && g.model === "gpt-good", r.stdout + r.stderr);
    ok("imagegen: output is exactly 1920x1080", size(out1) === "1920x1080", size(out1));
    ok("imagegen: raw file kept untouched at 1672x940", g.raw && size(g.raw) === "1672x940", String(g.raw));
    const side = fs.existsSync(out1 + ".json") ? JSON.parse(fs.readFileSync(out1 + ".json", "utf8")) : {};
    ok("imagegen: sidecar has prompt, full_prompt, model, refs, aspect, seconds, session, created", ["prompt", "full_prompt", "model", "refs", "aspect", "seconds", "session", "created"].every((k) => k in side) && side.session === g.session, JSON.stringify(side));
    ok("imagegen: the image came from this run's own session folder", fs.existsSync(path.join(generated, g.session)));
    const mem = path.join(env.RASANAI_HOME, "imagegen.json");
    ok("imagegen: working model remembered", fs.existsSync(mem) && JSON.parse(fs.readFileSync(mem, "utf8")).model === "gpt-good");
    let c = calls();
    ok("imagegen: first call tried gpt-bad, second gpt-good", c.length === 2 && c[0].model === "gpt-bad" && c[1].model === "gpt-good", c.map((x) => x.model).join(","));
    ok("imagegen: the prompt is stdin, '-' comes before any -i", c[1].argv.includes("-") && c[1].stdin.includes("An empty pottery wheel at dawn") && c[1].stdin.includes("exactly one image") && c[1].stdin.includes("landscape 16:9") && c[1].stdin.includes(out1 + ".part.png"));
    ok("imagegen: codex runs with --skip-git-repo-check -s workspace-write", c[1].argv.includes("--skip-git-repo-check") && c[1].argv.join(" ").includes("-s workspace-write"));

    // later call starts on the remembered model
    fs.rmSync(rec);
    const out2 = path.join(root, "out", "b.png");
    r = node("imagegen.mjs", ["generate", "--prompt", "second", "--aspect", "9:16", "--out", out2, "--ref", out1, "--force"]);
    c = calls();
    ok("imagegen: later calls start on the remembered model", c.length === 1 && c[0].model === "gpt-good", c.map((x) => x.model).join(","));
    ok("imagegen: 9:16 normalises to 1080x1920", size(out2) === "1080x1920", size(out2));
    const ai = c[0].argv.indexOf("-i");
    ok("imagegen: --ref arrives as -i <abs path> after the prompt marker", ai > c[0].argv.indexOf("-") && c[0].argv[ai + 1] === out1 && /reference/.test(c[0].stdin) && /not an edit target/.test(c[0].stdin));
    ok("imagegen: a missing ref is a clear failure", node("imagegen.mjs", ["generate", "--prompt", "x", "--out", path.join(root, "x.png"), "--ref", "/no/such.png"]).status === 2);

    // skip existing / force, and the part-file path
    fs.rmSync(rec);
    r = node("imagegen.mjs", ["generate", "--prompt", "again", "--out", out1]);
    ok("imagegen: generate skips an existing out", json(r).skipped === true && calls().length === 0);
    set({ FAKE_COPY: "1" });
    r = node("imagegen.mjs", ["generate", "--prompt", "forced", "--out", out1, "--force", "--aspect", "1x1".replace("1x1", "800x600")]);
    ok("imagegen: --force regenerates; WxH is honoured", json(r).ok && size(out1) === "800x600" && calls().length === 1, r.stdout + r.stderr);
    ok("imagegen: the .part.png is cleaned up", !fs.existsSync(out1 + ".part.png"));
    set({ FAKE_COPY: null });

    // transparent keeps alpha and pads
    const out3 = path.join(root, "out", "t.png");
    r = node("imagegen.mjs", ["generate", "--prompt", "a lone cup", "--out", out3, "--transparent", "--aspect", "1:1"]);
    const pf = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", out3], { encoding: "utf8" }).stdout.trim();
    ok("imagegen: transparent output pads to 1080x1080 and keeps an alpha channel", json(r).ok && size(out3) === "1080x1080" && /a/.test(pf) && /transparent background/.test(calls().pop().stdin), `${size(out3)} ${pf}`);

    // batch: anchor first, anchor passed as -i to the others, skip-existing, result file
    fs.rmSync(rec);
    const bdir = path.join(root, "batch");
    fs.mkdirSync(bdir, { recursive: true });
    const plan = { aspect: "16:9", style: "35mm photograph, warm light", avoid: "text, logos", anchor: "p2", images: [
      { id: "p1", prompt: "A kiln glowing at night", out: "plates/p1.png" }, { id: "p2", prompt: "A pottery wheel at dawn.", out: "plates/p2.png" }, { id: "p3", prompt: "Hands shaping clay", out: "plates/p3.png", aspect: "9:16" }] };
    const pp = path.join(bdir, "images.json");
    fs.writeFileSync(pp, JSON.stringify(plan));
    r = node("imagegen.mjs", ["batch", "--plan", pp, "--concurrency", "2"]);
    let b = json(r);
    ok("imagegen: batch makes all three", r.status === 0 && b.ok && b.done.length === 3 && b.failed.length === 0, r.stdout + r.stderr);
    c = calls();
    const forId = (needle) => c.find((x) => x.stdin.includes(needle));
    const anchorCall = c.findIndex((x) => x.stdin.includes("pottery wheel at dawn"));
    ok("imagegen: the anchor is made first, without refs", anchorCall === 0 && !c[0].argv.includes("-i"), JSON.stringify(c.map((x) => x.argv.includes("-i"))));
    const anchorOut = path.join(bdir, "plates", "p2.png");
    ok("imagegen: every other image gets the anchor as -i", ["kiln glowing", "Hands shaping"].every((n) => { const x = forId(n); return x && x.argv.includes("-i") && x.argv[x.argv.indexOf("-i") + 1] === anchorOut; }));
    ok("imagegen: full prompt is '<prompt>. Style: <style>. Avoid: <avoid>.'", forId("kiln glowing").stdin.includes("A kiln glowing at night. Style: 35mm photograph, warm light. Avoid: text, logos."));
    ok("imagegen: per-image aspect wins (p3 is 1080x1920)", size(path.join(bdir, "plates", "p3.png")) === "1080x1920" && size(path.join(bdir, "plates", "p1.png")) === "1920x1080");
    ok("imagegen: batch writes images.result.json", fs.existsSync(path.join(bdir, "images.result.json")) && b.result === path.join(bdir, "images.result.json"));
    fs.rmSync(rec);
    r = node("imagegen.mjs", ["batch", "--plan", pp]);
    b = json(r);
    ok("imagegen: a second batch skips everything and calls nothing", r.status === 0 && b.skipped.length === 3 && b.done.length === 0 && calls().length === 0, r.stdout);
    r = node("imagegen.mjs", ["batch", "--plan", pp, "--only", "p3", "--force"]);
    ok("imagegen: --only with --force redoes just that image", json(r).done.length === 1 && json(r).done[0].id === "p3" && calls().length === 1);

    // sheet
    const sheet = path.join(bdir, "sheet.jpg");
    r = node("imagegen.mjs", ["sheet", "--plan", pp, "--out", sheet]);
    ok("imagegen: sheet writes a contact sheet of every image", r.status === 0 && json(r).images.length === 3 && fs.existsSync(sheet) && size(sheet) === "1440x300", r.stdout + r.stderr);

    // failure -> exit 2 (one retry, so two calls), batch failed list
    set({ FAKE_FAIL: "1" });
    fs.rmSync(rec);
    r = node("imagegen.mjs", ["generate", "--prompt", "will fail", "--out", path.join(root, "f.png")]);
    ok("imagegen: a failed generation exits 2 after one retry and says why", r.status === 2 && json(r).ok === false && calls().length === 2 && /refused/.test(r.stderr), `${r.status} ${calls().length} ${r.stderr}`);
    fs.writeFileSync(pp, JSON.stringify({ aspect: "16:9", images: [{ id: "f1", prompt: "fails", out: "f1.png" }] }));
    r = node("imagegen.mjs", ["batch", "--plan", pp]);
    ok("imagegen: a failed batch exits 2 and lists the failure", r.status === 2 && json(r).failed.length === 1 && json(r).failed[0].id === "f1");
    ok("imagegen: stderr has IMAGE <id> failed", /IMAGE f1 failed/.test(r.stderr));
    set({ FAKE_FAIL: null });

    // timeout kills the process group
    set({ FAKE_SLEEP: "1" });
    const t0 = Date.now();
    r = node("imagegen.mjs", ["generate", "--prompt", "slow", "--out", path.join(root, "slow.png"), "--timeout", "1"]);
    ok("imagegen: a hung Codex is killed at the timeout (exit 2, retried once)", r.status === 2 && /timed out/.test(r.stderr) && Date.now() - t0 < 20000, `${r.status} ${Date.now() - t0}ms ${r.stderr}`);
    set({ FAKE_SLEEP: null });

    // usage
    ok("imagegen: no command is a usage error (exit 1)", node("imagegen.mjs", []).status === 1);
    ok("imagegen: generate without --prompt is a usage error (exit 1)", node("imagegen.mjs", ["generate", "--out", "x.png"]).status === 1);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v == null) delete env[k]; else env[k] = v; }
  }
}
