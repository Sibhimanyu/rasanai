// Smoke (<30 s): the CLI against a fake ComfyUI HTTP server and the fake provider. Run: node lib/video-generation/smoke.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startFakeComfy } from "./fake-comfy-server.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "video-generation.mjs");
const film = fs.mkdtempSync(path.join(os.tmpdir(), "vg-film-"));
const TOKEN = "s3cret-token-xyz";
const run = (argv, env = {}) => new Promise((res) => execFile("node", [CLI, ...argv], { env: { ...process.env, ...env }, encoding: "utf8" }, (e, so) => { let j = null; try { j = JSON.parse(so); } catch {} res({ code: e ? e.code : 0, j }); }));
const base = ["--film", film, "--width", "320", "--height", "192", "--duration", "1", "--fps", "24", "--checkpoint", "fake-ltx-video.safetensors"];

// 1. nothing running: honest "integration pending"
let r = await run(["doctor", "--endpoint", "http://127.0.0.1:1"]);
assert.equal(r.j.status, "integration pending"); assert.equal(r.code, 0);
r = await run(["doctor", "--endpoint", "http://127.0.0.1:1"], { RASANAI_HYBRID_COMFYUI: "1" });
assert.equal(r.j.status, "integration pending"); assert.match(r.j.providers.find((p) => p.id === "comfyui").reason, /no ComfyUI reachable/);
r = await run(["submit", ...base, "--provider", "comfyui", "--prompt", "x", "--consent"], { RASANAI_HYBRID_COMFYUI: "1", RASANAI_HYBRID_LTX: "1", RASANAI_COMFYUI_URL: "http://127.0.0.1:1" });
assert.equal(r.j.status, "integration pending"); assert.equal(r.code, 1);
assert.ok(!fs.existsSync(path.join(film, "hybrid", "jobs.jsonl")), "no job logged when unreachable");

// 2. full loop on the fake ComfyUI server
const srv = await startFakeComfy({ token: TOKEN });
const env = { RASANAI_HYBRID_COMFYUI: "1", RASANAI_HYBRID_LTX: "1", RASANAI_COMFYUI_URL: srv.url, RASANAI_COMFYUI_TOKEN: TOKEN };
const sub = (prompt, seed, layer) => ["submit", ...base, "--provider", "comfyui", "--prompt", prompt, "--seed", String(seed), "--layer", layer];
r = await run(["doctor"], env); assert.equal(r.j.status, "ready"); assert.deepEqual(r.j.providers.find((p) => p.id === "comfyui").checkpoints, ["fake-ltx-video.safetensors"]);
r = await run(["preview", ...sub("a drifting fog bank", 7, "s1.bg").slice(1)], env); assert.ok(r.j.ok && r.j.workflow_digest);
r = await run(sub("a drifting fog bank", 7, "s1.bg"), env); assert.equal(r.j.state, "awaiting-consent");
const A = r.j.job_id;
r = await run(["status", "--film", film, "--job", A], env); assert.equal(r.j.state, "awaiting-consent");
r = await run([...sub("a drifting fog bank", 7, "s1.bg"), "--consent"], env); assert.equal(r.j.state, "queued"); assert.equal(r.j.job_id, A);
r = await run([...sub("a drifting fog bank", 7, "s1.bg"), "--consent"], env); assert.ok(r.j.idempotent, "same key must not start a second job");
assert.equal(srv.requests.filter((q) => q.path === "/prompt").length, 1);
r = await run(["status", "--film", film, "--job", A, "--wait", "10"], env); assert.equal(r.j.state, "preview-ready");
r = await run(["verify", "--film", film, "--job", A], env); assert.equal(r.code, 1, "verify before adopt must fail");
r = await run(["adopt", "--film", film, "--job", A], env); assert.equal(r.j.state, "accepted");
r = await run(["verify", "--film", film, "--job", A], env); assert.ok(r.j.ok, JSON.stringify(r.j)); assert.equal(r.j.frames, 24);
r = await run(["adopt", "--film", film, "--job", A], env); assert.ok(r.j.idempotent);
const asset = JSON.parse(fs.readFileSync(path.join(film, "hybrid/generated", A, "asset.json"), "utf8"));
assert.equal(asset.workflow_digest.length, 64); assert.equal(asset.config.seed, 7); assert.ok(asset.licence_note);
// the server saw the token only as a header
assert.ok(srv.requests.every((q) => q.auth === `Bearer ${TOKEN}`));
for (const f of ["hybrid/jobs.jsonl", `hybrid/generated/${A}/asset.json`, `hybrid/generated/${A}/job.json`]) { const t = fs.readFileSync(path.join(film, f), "utf8"); assert.ok(!t.includes(TOKEN) && !t.includes(film) && !t.includes(os.homedir()), f + " leaks"); }

// 3. a second plate, then regenerate only the first: only that plate's digest changes
r = await run([...sub("a calm harbour", 3, "s2.bg"), "--consent"], env); const B = r.j.job_id;
await run(["status", "--film", film, "--job", B, "--wait", "10"], env); await run(["adopt", "--film", film, "--job", B], env);
const shaOf = (id) => JSON.parse(fs.readFileSync(path.join(film, "hybrid/generated", id, "asset.json"), "utf8")).output.sha256;
const bBefore = shaOf(B), aBefore = shaOf(A);
r = await run([...sub("a drifting fog bank", 8, "s1.bg"), "--consent"], env); const A2 = r.j.job_id; assert.notEqual(A2, A);
await run(["status", "--film", film, "--job", A2, "--wait", "10"], env); await run(["adopt", "--film", film, "--job", A2], env);
assert.equal(shaOf(B), bBefore); assert.equal(shaOf(A), aBefore); assert.notEqual(shaOf(A2), aBefore);

// 4. cancel is idempotent; a server restart is reported, not faked
r = await run([...sub("cancel me", 1, "s3.bg"), "--consent"], env); const C = r.j.job_id;
r = await run(["cancel", "--film", film, "--job", C], env); assert.equal(r.j.state, "cancelled");
r = await run(["cancel", "--film", film, "--job", C], env); assert.ok(r.j.idempotent);
r = await run([...sub("lost to restart", 1, "s4.bg"), "--consent"], env); const D = r.j.job_id; srv.restart();
await new Promise((x) => setTimeout(x, 5200));
r = await run(["status", "--film", film, "--job", D], env); assert.equal(r.j.state, "failed"); assert.match(r.j.error, /restarted/);
await srv.close();

// 5. fake provider loop (default-available, never "Verified")
const film2 = fs.mkdtempSync(path.join(os.tmpdir(), "vg-film2-"));
const f2 = ["--film", film2, "--width", "320", "--height", "192", "--duration", "1", "--prompt", "fake plate", "--layer", "s1.bg"];
r = await run(["submit", ...f2, "--consent"]); const F = r.j.job_id; assert.equal(r.j.state, "queued");
r = await run(["status", "--film", film2, "--job", F]); assert.equal(r.j.state, "preview-ready");
await run(["adopt", "--film", film2, "--job", F]); r = await run(["verify", "--film", film2, "--job", F]); assert.ok(r.j.ok);
r = await run(["list", "--film", film2]); assert.equal(r.j.jobs[0].state, "delivery-ready");
console.log("video-generation smoke: ok");
