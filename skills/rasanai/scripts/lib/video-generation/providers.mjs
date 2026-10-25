// Provider interface: capabilities() validate(spec) estimate(spec) submit(spec) poll(pid) cancel(pid) collect(pid, outputs, destFile) [+ available()].
//   poll -> {state: "queued"|"running"|"done"|"failed"|"lost"|"unreachable", note, outputs?}
// spec: {workflow, graph, params, prompt, config, refs}. Two providers: "fake" (default-available) and "comfyui" (opt-in, RASANAI_HYBRID_COMFYUI=1).
import fs from "node:fs";
import path from "node:path";
import { checkGraph } from "./workflows.mjs";
import { makeFakeClip } from "./fake-media.mjs";
import { clientIdFor, findByClient } from "../provider-jobs.mjs"; // Plan 06 V4: client id, unknown-outcome reconcile

const LOCAL_COST = { kind: "local", usd: 0, note: "local GPU time and memory are unmeasured until a real run is recorded" };

export function makeFake() {
  const jobs = new Map(); // process-local; job.json carries everything needed to re-collect
  return {
    id: "fake",
    async available() { return { ok: true, status: "ready", note: "fake provider: synthetic clips, no model, no GPU, no network; never counts as a real generation" }; },
    capabilities() { return { text_to_video: true, references: true, max_duration_s: 10, cancel: true, seeds: "deterministic", model_id: "fake-provider", model_revision: "fake-1" }; },
    validate(spec) { if (spec.config.duration_s > 10) throw new Error("fake provider: duration_s <= 10"); },
    estimate() { return { kind: "fake", usd: 0, note: "no cost" }; },
    async submit(spec) { const pid = "fake-" + spec.idem.slice(0, 12); jobs.set(pid, { cancelled: false }); return { provider_job_id: pid }; },
    async poll(pid) { return jobs.get(pid)?.cancelled ? { state: "failed", note: "cancelled" } : { state: "done", outputs: [{ fake: true }] }; },
    async cancel(pid) { const j = jobs.get(pid); if (j) j.cancelled = true; return { ok: true }; },
    // the synthetic provider derives its job id from the idempotency key: found only when this process submitted it
    async reconcile({ idem }) { const pid = "fake-" + String(idem).slice(0, 12); return jobs.has(pid) ? { found: true, provider_job_id: pid, state: "queued", searched: ["process memory"] } : { found: false, searched: ["process memory"] }; },
    async collect(pid, outputs, dest, spec) {
      const c = spec.config;
      makeFakeClip(dest, { seed: c.seed, prompt: spec.prompt, width: spec.params.gen_width, height: spec.params.gen_height, fps_num: spec.params.gen_fps, frames: spec.params.length });
      return { path: dest };
    },
  };
}

export function comfyEndpoint(env, args) {
  const raw = String(args.endpoint || env.RASANAI_COMFYUI_URL || "http://127.0.0.1:8188");
  const u = new URL(raw);
  u.username = ""; u.password = "";
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname);
  const approved = loopback || args["approve-endpoint"] === u.host || env.RASANAI_COMFYUI_APPROVED_HOST === u.host;
  return { base: u.origin, host: u.host, loopback, approved };
}

export function makeComfy(env, args = {}) {
  const ep = comfyEndpoint(env, args);
  const token = env.RASANAI_COMFYUI_TOKEN || null; // header only; never logged or written
  const hdr = () => (token ? { authorization: `Bearer ${token}` } : {});
  const call = async (p, init = {}, ms = 8000) => {
    const r = await fetch(ep.base + p, { ...init, headers: { ...hdr(), ...(init.body ? { "content-type": "application/json" } : {}) }, signal: AbortSignal.timeout(ms) });
    return r;
  };
  const withRetry = async (fn, n = 3) => { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await new Promise((r) => setTimeout(r, 150 * (i + 1))); } } throw e; };
  const P = {
    id: "comfyui", ep, token,
    async available() {
      if (env.RASANAI_HYBRID_COMFYUI !== "1") return { ok: false, status: "integration pending", reason: "RASANAI_HYBRID_COMFYUI=1 is not set: the ComfyUI path is off by default" };
      if (!ep.approved) return { ok: false, status: "integration pending", reason: `endpoint ${ep.host} is not loopback and not approved (pass --approve-endpoint ${ep.host} or RASANAI_COMFYUI_APPROVED_HOST)` };
      try {
        const r = await call("/system_stats", {}, 3000);
        if (!r.ok) return { ok: false, status: "integration pending", reason: `ComfyUI answered HTTP ${r.status} on /system_stats` };
        const stats = await r.json();
        let checkpoints = null;
        try { const o = await (await call("/object_info/CheckpointLoaderSimple", {}, 4000)).json(); checkpoints = o.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? null; } catch {}
        return { ok: true, status: "ready", version: stats.system?.comfyui_version ?? null, devices: (stats.devices || []).map((d) => d.name), checkpoints };
      } catch (e) { return { ok: false, status: "integration pending", reason: `no ComfyUI reachable at ${ep.host} (${e.cause?.code || e.name})` }; }
    },
    capabilities() { return { text_to_video: true, references: false, cancel: true, seeds: "requested; repeatability unverified until measured", websocket: "not used (history polling)" }; },
    validate(spec) {
      checkGraph(spec.workflow, spec.graph);
      if (spec.refs.length && !spec.workflow.accepts_reference) throw new Error(`workflow ${spec.workflow.id} is text-to-video: reference inputs are unsupported`);
      if (spec.config.duration_s > 20) throw new Error("duration_s > 20 is not accepted (memory unknown)");
    },
    estimate() { return LOCAL_COST; },
    async submit(spec) {
      // client_id is the handle for finding this job again if the answer never arrives (see reconcile): a timeout is an UNKNOWN outcome, not a failure
      const client_id = clientIdFor(spec.idem);
      const r = await call("/prompt", { method: "POST", body: JSON.stringify({ prompt: spec.graph, client_id }) }, 15000);
      const j = await r.json().catch(() => null);
      if (r.status >= 400 && r.status < 500 || (r.ok && j && !j.prompt_id && j.error)) { const e = new Error(`ComfyUI rejected the graph: ${j?.error?.message || "HTTP " + r.status}${j?.node_errors ? " " + JSON.stringify(j.node_errors).slice(0, 300) : ""}`); e.rejected = true; throw e; }
      if (!r.ok || !j || !j.prompt_id) throw new Error(`ComfyUI answered HTTP ${r.status} without a prompt id: the job may be queued`); // not marked rejected: classified as unknown
      return { provider_job_id: j.prompt_id };
    },
    // query the SAME job by client id in the running and pending queue and in the history; never resubmits, never clears or reorders anyone's queue
    async reconcile({ idem }) {
      const clientId = clientIdFor(idem), searched = [];
      let q = {}, h = {};
      try { q = await (await call("/queue")).json(); searched.push("queue"); } catch {}
      try { h = await (await call("/history?max_items=200")).json(); searched.push("history"); } catch {}
      const hit = findByClient({ queue_running: q.queue_running, queue_pending: q.queue_pending, history: h }, clientId);
      return { ...hit, searched };
    },
    async poll(pid, since_ms = 0) {
      try {
        const h = await withRetry(async () => (await call(`/history/${pid}`)).json());
        const e = h[pid];
        if (e) {
          if (e.status?.status_str === "error") return { state: "failed", note: "ComfyUI reported a node error: " + JSON.stringify(e.status.messages ?? "").slice(0, 300) };
          const outs = [];
          for (const o of Object.values(e.outputs || {})) for (const k of ["videos", "gifs", "images"]) for (const f of o[k] || []) if (/\.(mp4|webm|mov|webp|gif)$/i.test(f.filename)) outs.push(f);
          return e.status?.completed === false || !outs.length ? { state: "running" } : { state: "done", outputs: outs };
        }
        const q = await withRetry(async () => (await call("/queue")).json());
        const has = (a) => (a || []).some((x) => x[1] === pid);
        if (has(q.queue_running)) return { state: "running" };
        if (has(q.queue_pending)) return { state: "queued" };
        return since_ms > 5000 ? { state: "lost", note: "prompt is in neither queue nor history (ComfyUI restarted or the job was cancelled)" } : { state: "queued" };
      } catch (e) { return { state: "unreachable", note: `ComfyUI unreachable (${e.cause?.code || e.name}); job kept, poll again` }; }
    },
    // cancels ONLY this job: deletes its own prompt id from the pending queue; /interrupt is sent only when the running job IS this one.
    // It never POSTs {clear:true} and never touches another person's queued or running work.
    async cancel(pid) {
      await call("/queue", { method: "POST", body: JSON.stringify({ delete: [pid] }) });
      try { const q = await (await call("/queue")).json(); if ((q.queue_running || []).some((x) => x[1] === pid)) await call("/interrupt", { method: "POST", body: "{}" }); } catch {}
      return { ok: true };
    },
    async collect(pid, outputs, dest) {
      const f = outputs[0];
      const qs = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output" });
      const r = await withRetry(() => call("/view?" + qs, {}, 60000));
      if (!r.ok) throw new Error(`ComfyUI /view answered HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return { path: dest, source_ext: path.extname(f.filename) };
    },
  };
  return P;
}
