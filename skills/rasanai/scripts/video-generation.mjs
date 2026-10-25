#!/usr/bin/env node
// Provider-neutral AI video plates (C4 in docs/plans/hybrid-film-contracts.md). Zero dependencies (Node >= 20, ffmpeg/ffprobe).
// JSON on stdout, progress on stderr. Generated plates are optional: with no provider the film proceeds without them.
//
//   node video-generation.mjs doctor [--provider fake|comfyui|all] [--endpoint <url>]
//        -> {ok, status: "ready"|"integration pending", providers: [...], workflows, ltx}   (exit 0; never fakes success)
//   node video-generation.mjs list --film <dir>                       approved workflows + latest state of every job
//   node video-generation.mjs preview --film <dir> --prompt "<t>" [opts]    validate + estimate + digests; submits nothing
//   node video-generation.mjs submit --film <dir> --prompt "<t>" --consent [opts]
//        opts: --provider fake|comfyui (default fake) --workflow <approved id> --layer <scene.name> --seed N --duration S
//              --width W --height H --fps 24|30000/1001 --aspect 16:9 --negative "<t>" --checkpoint <name> --steps N
//              --ref <film-relative file> --ref-rights owned|licensed|generated --idempotency-key K --retry --endpoint URL
//        Without --consent the job stops at "awaiting-consent" (re-run with --consent, or --job <id> --consent). A repeated
//        submit with the same idempotency key never starts a second job (--retry only after failed/cancelled).
//        ComfyUI off (RASANAI_HYBRID_COMFYUI != 1) or unreachable -> {ok:false, status:"integration pending"}, exit 1, no job logged.
//   node video-generation.mjs status --film <dir> --job <id> [--wait S]     polls the provider; collects a preview (preview-ready)
//   node video-generation.mjs cancel --film <dir> --job <id>
//   node video-generation.mjs adopt  --film <dir> --job <id>                conforms preview to the film size/fps/duration (never stretches),
//                                                                           writes hybrid/generated/<id>/asset.json, state "accepted", then upserts
//                                                                           hybrid/sources.json (C1: asset copied to assets/generated/<id>.mp4; layer via --layer at submit;
//                                                                           --role background|foreground|matte|screen-content (default background) --z N)
//   node video-generation.mjs verify --film <dir> --job <id>                ffprobe frames/size + sha256 + no leaked path/token -> "delivery-ready"
// Files: <film>/hybrid/jobs.jsonl (append-only; consent lines have kind "consent"), hybrid/generated/<job-id>/{job.json,preview/,plate.mp4,asset.json}.
// Env: RASANAI_HYBRID_COMFYUI=1 enables ComfyUI; RASANAI_COMFYUI_URL (default http://127.0.0.1:8188; non-loopback needs --approve-endpoint <host>);
//      RASANAI_COMFYUI_TOKEN (header only, never written); RASANAI_COMFYUI_CHECKPOINT; RASANAI_HYBRID_LTX=1 reports LTX workflows as opted in.
//      LTX weights are never bundled, downloaded or default. Regenerating one plate = a new job id with its own sha256; other plates are untouched.
// Plan 06 V4: a submit that times out (or whose answer cannot be read) leaves state "unknown_outcome", NOT "failed": the job may be queued. `status --job <id>`
//   reconciles the SAME job by its client id in the provider's queue and history; a new job is never started while one is unknown (same idempotency key = same job).
//   `status --job <id> --confirm-not-submitted` is the person's own statement that it never reached the provider (it then ends "failed" and --retry is allowed).
//   A hosted (non-loopback) provider needs --consent-share-inputs on top of --consent when reference inputs leave the machine (or --sensitive marks the prompt).
//   cancel removes only this job's prompt id; it never clears another person's ComfyUI queue. adopt writes asset.json once (immutable) with input hashes, rights,
//   duration, the model licence record from hybrid/model-licenses.json (unreviewed when absent) and cost.actual (null: ComfyUI reports no cost).
// Exit: 0 ok; 1 failed check / unable / integration pending; 2 usage error.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/common.mjs";
import { digest, fileSha, parseFps, frameCount, redactor, inside, ffprobe, ffmpeg, have, atomicWrite } from "./lib/video-generation/util.mjs";
import { approved, getWorkflow, fill } from "./lib/video-generation/workflows.mjs";
import { makeFake, makeComfy } from "./lib/video-generation/providers.mjs";
import { upsertSources } from "./lib/video-generation/sources.mjs";
import { append, latest, readJob, writeJob, jobDir, validId, consentFor, TERMINAL } from "./lib/video-generation/jobs.mjs";
import { classifySubmitError, consentPolicy, discoverComfy, modelLicense, provenanceOf, validateProvenance, writeOnce, unknownNote } from "./lib/provider-jobs.mjs"; // Plan 06 V4

const args = parseArgs();
const cmd = args._[0];
const ENV = process.env;
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
const usage = (m) => { process.stderr.write(`PROBLEM: ${m}\n`); process.exit(2); };
const err = (s) => process.stderr.write(s + "\n");
const pad32 = (n) => Math.ceil(n / 32) * 32;

function filmDir() {
  if (!args.film || args.film === true) usage("--film <dir> is required");
  if (!fs.existsSync(args.film) || !fs.statSync(args.film).isDirectory()) usage(`film folder not found: ${args.film}`);
  return fs.realpathSync(args.film);
}
const mkRedact = (film) => redactor([ENV.RASANAI_COMFYUI_TOKEN], film ? [film] : []);
function provider(id) {
  if (id === "fake") return makeFake();
  if (id === "comfyui") return makeComfy(ENV, args);
  usage(`unknown provider "${id}" (fake|comfyui)`);
}
function ltxState() {
  return ENV.RASANAI_HYBRID_LTX === "1" ? { opted_in: true, note: "LTX workflows allowed; weights must already be installed by you in ComfyUI. Check the licence of the exact revision." } : { opted_in: false, note: "LTX is off (RASANAI_HYBRID_LTX=1 to opt in). Weights are never bundled or downloaded by RasanAI." };
}

// ------------------------------------------------------------------ spec
async function buildSpec(film, prov) {
  const prompt = args["prompt-file"] ? fs.readFileSync(inside(film, args["prompt-file"]), "utf8").trim() : args.prompt;
  if (!prompt || prompt === true) usage("--prompt \"<text>\" (or --prompt-file <film-relative>) is required");
  const wf = getWorkflow(args.workflow || "ltx-video-t2v");
  if (/ltx/i.test(wf.id) && ENV.RASANAI_HYBRID_LTX !== "1" && prov.id !== "fake") throw new Error(`workflow ${wf.id} is LTX-family: set RASANAI_HYBRID_LTX=1 to opt in (weights are never bundled)`);
  const f = parseFps(args.fps);
  const width = +(args.width || 768), height = +(args.height || 432), duration_s = +(args.duration || 2), seed = Number.isInteger(+args.seed) ? +args.seed : 1;
  if (![width, height, duration_s].every((n) => n > 0)) usage("width, height, duration must be positive");
  const layer = args.layer && args.layer !== true ? String(args.layer) : null;
  if (layer && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(layer)) usage("--layer must look like <scene_id>.<name>");
  const aspect = args.aspect && args.aspect !== true ? String(args.aspect) : `${width}:${height}`;
  const refs = [];
  for (const r of [].concat(args.ref || []).filter((x) => x !== true)) {
    const rights = args["ref-rights"];
    if (!["owned", "licensed", "generated"].includes(rights)) throw new Error("--ref needs --ref-rights owned|licensed|generated (inspiration-only is never a generation input)");
    refs.push({ sha256: fileSha(inside(film, r)), rights });
  }
  const gen_fps = Math.ceil(f.fps_num / f.fps_den);
  const frames = Math.ceil(duration_s * gen_fps);
  const checkpoint = prov.id === "fake" ? "fake-ltx-video" : args.checkpoint || ENV.RASANAI_COMFYUI_CHECKPOINT;
  if (!checkpoint || checkpoint === true) throw new Error("--checkpoint <name> (or RASANAI_COMFYUI_CHECKPOINT) is required: RasanAI never picks or changes your checkpoint");
  const negative = args.negative && args.negative !== true ? String(args.negative) : "text, letters, watermark, logo, user interface, captions, distorted typography";
  const params = { checkpoint, prompt, negative_prompt: negative, seed, steps: +(args.steps || 20), gen_width: pad32(width), gen_height: pad32(height), gen_fps, length: Math.ceil((frames - 1) / 8) * 8 + 1 };
  const graph = fill(wf.template, params);
  const config = { seed, aspect, duration_s, width, height, ...f };
  const idem = args["idempotency-key"] && args["idempotency-key"] !== true ? String(args["idempotency-key"]) : digest({ p: prov.id, w: wf.workflow_digest, prompt, negative, seed, config, checkpoint, steps: params.steps, refs, layer });
  return { workflow: wf, graph, params, prompt, config, refs, layer, idem, sensitive: !!args.sensitive };
}

// ------------------------------------------------------------------ commands
async function doctor() {
  const which = args.provider || "all";
  const providers = [];
  const ff = { ffmpeg: have("ffmpeg"), ffprobe: have("ffprobe") };
  if (which === "all" || which === "fake") { const p = makeFake(); providers.push({ id: "fake", ...(await p.available()), capabilities: p.capabilities() }); }
  if (which === "all" || which === "comfyui") {
    const p = makeComfy(ENV, args);
    providers.push({ id: "comfyui", endpoint_host: p.ep.host, ...(await p.available()), capabilities: p.capabilities(), note_real_run: "no real generation is recorded: ComfyUI stays 'integration pending' until a configured model produces a plate" });
  }
  // Plan 06 V4: what is actually installed behind ComfyUI is discovered from it (node types, checkpoints), never assumed; a missing model is reported, never downloaded
  const comfy = providers.find((p) => p.id === "comfyui");
  if (comfy && comfy.ok) {
    const P = makeComfy(ENV, args);
    comfy.discovery = await discoverComfy(async (p) => (await fetch(P.ep.base + p, { headers: ENV.RASANAI_COMFYUI_TOKEN ? { authorization: `Bearer ${ENV.RASANAI_COMFYUI_TOKEN}` } : {}, signal: AbortSignal.timeout(8000) })).json(), approved());
  }
  const real = providers.filter((p) => p.id !== "fake");
  const status = real.length && real.every((p) => p.ok) ? "ready" : "integration pending";
  out({ ok: true, status, providers, tools: ff, ltx: ltxState(), workflows: approved().map((w) => ({ id: w.id, kind: w.kind, workflow_digest: w.workflow_digest, tested_with: w.tested_with })) });
}

function list() {
  const film = filmDir();
  out({ ok: true, workflows: approved().map((w) => ({ id: w.id, kind: w.kind, workflow_digest: w.workflow_digest, licence_note: w.licence_note })), jobs: [...latest(film).values()].map((j) => ({ job_id: j.job_id, state: j.state, provider: j.provider, layer_id: j.layer_id, state_at: j.state_at, note: j.note })) });
}

async function preview() {
  const film = filmDir(), prov = provider(args.provider || "fake");
  const spec = await buildSpec(film, prov);
  try { prov.validate(spec); } catch (e) { out({ ok: false, error: mkRedact(film)(e.message) }, 1); }
  const av = await prov.available();
  out({ ok: true, provider: prov.id, provider_status: av.status, reason: av.reason ?? null, workflow: spec.workflow.id, workflow_digest: spec.workflow.workflow_digest, graph_digest: digest(spec.graph), config: spec.config, idempotency_key: spec.idem, cost_estimate: prov.estimate(spec), licence_note: spec.workflow.licence_note, consent_needed: true });
}

async function submit() {
  const film = filmDir(), redact = mkRedact(film), prov = provider(args.provider || "fake");
  let spec;
  try { spec = await buildSpec(film, prov); prov.validate(spec); } catch (e) { out({ ok: false, error: redact(e.message) }, 1); }
  // availability first: an unreachable provider never produces a job line or a fake success
  const av = await prov.available();
  if (!av.ok) out({ ok: false, status: "integration pending", provider: prov.id, reason: redact(av.reason) }, 1);
  if (prov.id === "comfyui" && av.checkpoints && !av.checkpoints.includes(spec.params.checkpoint)) out({ ok: false, error: `checkpoint "${spec.params.checkpoint}" is not installed in ComfyUI (found: ${av.checkpoints.join(", ") || "none"})` }, 1);

  const log = latest(film);
  const prior = [...log.values()].filter((j) => j.idempotency_key === spec.idem);
  const live = prior.find((j) => !["failed", "cancelled"].includes(j.state));
  let jobId;
  if (live) { jobId = live.job_id; if (live.state !== "awaiting-consent" || !args.consent) out({ ok: true, idempotent: true, job_id: jobId, state: live.state, note: live.state === "unknown_outcome" ? "same idempotency key: its outcome is unknown, so no second job is started; run status to reconcile it" : "same idempotency key: no second job started" }); }
  else {
    if (prior.length && !args.retry) out({ ok: false, error: `job ${prior[0].job_id} with this key ended ${prior[0].state}; pass --retry to start a new one`, job_id: prior[0].job_id, state: prior[0].state }, 1);
    jobId = "gen-" + spec.idem.slice(0, 12) + (prior.length ? "-r" + (prior.length + 1) : "");
    const cost = prov.estimate(spec);
    writeJob(film, jobId, {
      job_id: jobId, idempotency_key: spec.idem, provider: prov.id, endpoint_host: prov.ep?.host ?? null, workflow_id: spec.workflow.id, workflow_digest: spec.workflow.workflow_digest, graph_digest: digest(spec.graph),
      params: { ...spec.params, prompt: undefined, negative_prompt: spec.params.negative_prompt }, prompt: redact(spec.prompt), reference_inputs: spec.refs, config: spec.config, layer_id: spec.layer,
      model_id: prov.id === "fake" ? "fake-provider" : spec.params.checkpoint, model_revision: prov.id === "fake" ? "fake-1" : null, licence_note: spec.workflow.licence_note, cost_estimate: cost, provider_job_id: null, submitted_at: null, preview: null,
    });
    append(film, redact, { job_id: jobId, idempotency_key: spec.idem, state: "requested", provider: prov.id, layer_id: spec.layer, cost_estimate: cost, note: "job requested" });
    append(film, redact, { job_id: jobId, idempotency_key: spec.idem, state: "awaiting-consent", provider: prov.id, layer_id: spec.layer, cost_estimate: cost, note: "waiting for the person to approve provider use and cost" });
  }
  const job = readJob(film, jobId);
  if (!args.consent) out({ ok: true, job_id: jobId, state: "awaiting-consent", cost_estimate: job.cost_estimate, licence_note: job.licence_note, next: `re-run with --consent to start (provider ${prov.id}${prov.ep ? " at " + prov.ep.host : ""})` });
  const policy = consentPolicy(prov, spec, { consent: !!args.consent, shareInputs: !!args["consent-share-inputs"] });
  if (!policy.ok) out({ ok: false, job_id: jobId, state: "awaiting-consent", missing_consent: policy.missing, would_send: policy.leaves_machine, note: "nothing was sent" }, 1);
  if (!consentFor(film, jobId)) append(film, redact, { kind: "consent", job_id: jobId, provider: prov.id, scope: prov.id === "fake" ? "fake-provider (no cost, no upload)" : `provider use and cost estimate; ${policy.local ? "local" : "HOSTED"} endpoint ${prov.ep.host}${policy.need_input_consent ? "; inputs sent: " + policy.leaves_machine.join(", ") : ""}`, note: "consent recorded by --consent" });
  const specForSubmit = { ...spec, idem: job.idempotency_key };
  try {
    const r = await prov.submit(specForSubmit);
    job.provider_job_id = r.provider_job_id; job.submitted_at = new Date().toISOString();
    writeJob(film, jobId, job);
    append(film, redact, { job_id: jobId, idempotency_key: job.idempotency_key, state: "queued", provider: prov.id, layer_id: job.layer_id, cost_estimate: job.cost_estimate, note: "submitted to provider" });
    out({ ok: true, job_id: jobId, state: "queued", provider_job_id: r.provider_job_id });
  } catch (e) {
    const k = classifySubmitError(e);
    if (k.outcome === "unknown") { // the job may be queued: record the uncertainty, keep the job, never resubmit
      job.submit_attempted_at = new Date().toISOString(); writeJob(film, jobId, job);
      append(film, redact, { job_id: jobId, idempotency_key: job.idempotency_key, state: "unknown_outcome", provider: prov.id, layer_id: job.layer_id, cost_estimate: job.cost_estimate, note: unknownNote([]) + " (" + k.why + ")" });
      out({ ok: false, job_id: jobId, state: "unknown_outcome", error: redact(k.why), next: `node video-generation.mjs status --film <dir> --job ${jobId}   (reconciles the same job; do not resubmit)` }, 1);
    }
    append(film, redact, { job_id: jobId, idempotency_key: job.idempotency_key, state: "failed", provider: prov.id, layer_id: job.layer_id, cost_estimate: job.cost_estimate, note: e.message });
    out({ ok: false, job_id: jobId, state: "failed", error: redact(e.message), outcome: k.outcome }, 1);
  }
}

function needJob(film) {
  const id = args.job;
  if (!id || id === true || !validId(id)) usage("--job <job-id> is required");
  const cur = latest(film).get(id), job = readJob(film, id);
  if (!cur || !job) { out({ ok: false, error: `no job ${id} in this film` }, 1); }
  return { id, cur, job };
}
const line = (film, redact, cur, job, state, note) => append(film, redact, { job_id: job.job_id, idempotency_key: job.idempotency_key, state, provider: job.provider, layer_id: job.layer_id, cost_estimate: job.cost_estimate, note });

async function status() {
  const film = filmDir(), redact = mkRedact(film), { cur, job } = needJob(film);
  if (cur.state === "unknown_outcome") { // Plan 06 V4: query the SAME job; never resubmit
    if (args["confirm-not-submitted"]) { line(film, redact, cur, job, "failed", "the person confirmed the job never reached the provider; a new job may be started with --retry"); out({ ok: false, job_id: job.job_id, state: "failed", note: "confirmed not submitted; --retry is now allowed" }, 1); }
    const prov0 = provider(job.provider), av0 = await prov0.available();
    if (!av0.ok) out({ ok: false, status: "integration pending", job_id: job.job_id, state: "unknown_outcome", reason: redact(av0.reason), note: "the provider is unreachable, so the job cannot be looked up yet; it stays unknown" }, 1);
    const rc = await prov0.reconcile({ idem: job.idempotency_key });
    if (!rc.found) { line(film, redact, cur, job, "unknown_outcome", unknownNote(rc.searched || [])); out({ ok: false, job_id: job.job_id, state: "unknown_outcome", searched: rc.searched || [], note: "not found, which is not proof it was never queued (the provider's history is finite). Wait and run status again, or pass --confirm-not-submitted if you have checked the provider yourself." }, 1); }
    job.provider_job_id = rc.provider_job_id; job.submitted_at = job.submitted_at || job.submit_attempted_at || new Date().toISOString(); writeJob(film, job.job_id, job);
    line(film, redact, cur, job, rc.state === "failed" ? "failed" : "queued", `reconciled: the same job was found at the provider (${rc.state})`);
    if (rc.state === "failed") out({ ok: false, job_id: job.job_id, state: "failed", error: "the provider reports this job failed" }, 1);
    cur.state = "queued";
  }
  if (!["queued", "running"].includes(cur.state)) out({ ok: true, job_id: job.job_id, state: cur.state, note: cur.note, preview: job.preview });
  const prov = provider(job.provider);
  const av = await prov.available();
  if (!av.ok) out({ ok: false, status: "integration pending", job_id: job.job_id, state: cur.state, reason: redact(av.reason) }, 1);
  const deadline = Date.now() + (+args.wait || 0) * 1000;
  for (;;) {
    const p = await prov.poll(job.provider_job_id, Date.now() - Date.parse(job.submitted_at));
    if (p.state === "queued" || p.state === "running") {
      line(film, redact, cur, job, p.state, p.state === "running" ? "generating" : "waiting in the provider queue");
      if (Date.now() < deadline) { await new Promise((r) => setTimeout(r, 500)); continue; }
      out({ ok: true, job_id: job.job_id, state: p.state });
    }
    if (p.state === "unreachable") out({ ok: false, job_id: job.job_id, state: cur.state, note: redact(p.note) }, 1);
    if (p.state === "failed" || p.state === "lost") { line(film, redact, cur, job, "failed", p.note); out({ ok: false, job_id: job.job_id, state: "failed", error: redact(p.note) }, 1); }
    try {
      fs.mkdirSync(path.join(jobDir(film, job.job_id), "preview"), { recursive: true });
      const dest = path.join(jobDir(film, job.job_id), "preview", "plate.mp4");
      await prov.collect(job.provider_job_id, p.outputs, dest, { config: job.config, prompt: job.prompt, params: { ...job.params, prompt: job.prompt } });
      const pr = ffprobe(dest);
      if (!pr || !pr.frames) throw new Error("collected output is not a readable video");
      job.preview = { path: `hybrid/generated/${job.job_id}/preview/plate.mp4`, sha256: fileSha(dest), frames: pr.frames, width: pr.width, height: pr.height };
      writeJob(film, job.job_id, job);
      line(film, redact, cur, job, "preview-ready", "preview collected");
      out({ ok: true, job_id: job.job_id, state: "preview-ready", preview: job.preview });
    } catch (e) { line(film, redact, cur, job, "failed", e.message); out({ ok: false, job_id: job.job_id, state: "failed", error: redact(e.message) }, 1); }
  }
}

async function cancel() {
  const film = filmDir(), redact = mkRedact(film), { cur, job } = needJob(film);
  if (TERMINAL.has(cur.state)) out({ ok: true, idempotent: true, job_id: job.job_id, state: cur.state });
  if (job.provider_job_id) { try { const prov = provider(job.provider); if ((await prov.available()).ok) await prov.cancel(job.provider_job_id); } catch (e) { err("cancel at provider failed: " + redact(e.message)); } }
  line(film, redact, cur, job, "cancelled", "cancelled by request");
  out({ ok: true, job_id: job.job_id, state: "cancelled" });
}

// the C1 sources hint of an adopted plate (asset.json is the provenance; hybrid/sources.json is upserted from this)
function sourcesHint(job, asset, c) {
  return { asset: { id: job.job_id, path: asset.output.path, rights: "generated", sha256: asset.output.sha256, media: { fps_num: c.fps_num, fps_den: c.fps_den, width: c.width, height: c.height } },
    shot_layer: job.layer_id ? { layer_id: job.layer_id, kind: "generated-plate", asset_id: job.job_id, in_s: 0, duration_s: c.duration_s } : null };
}
function writeSources(film, job, asset, c) {
  const role = args.role && args.role !== true ? String(args.role) : "background";
  if (!["background", "foreground", "matte", "screen-content"].includes(role)) usage("--role must be background|foreground|matte|screen-content");
  const hint = sourcesHint(job, asset, c);
  try { const sources = upsertSources(film, hint, asset.output.path, { role, z: Number.isInteger(+args.z) ? +args.z : 0 }); if (sources.written) hint.asset.path = sources.asset_path; return { hint, sources }; }
  catch (e) { return { hint, sources: { written: false, errors: [String(e.message)] } }; }
}

function adopt() {
  const film = filmDir(), redact = mkRedact(film), { cur, job } = needJob(film);
  const dir = jobDir(film, job.job_id), assetP = path.join(dir, "asset.json");
  if (["accepted", "delivery-ready"].includes(cur.state) && fs.existsSync(assetP)) { const a = JSON.parse(fs.readFileSync(assetP, "utf8")), w = writeSources(film, job, a, a.config); out({ ok: true, idempotent: true, job_id: job.job_id, state: cur.state, asset: `hybrid/generated/${job.job_id}/asset.json`, sha256: a.output.sha256, sources: w.sources, sources_hint: w.hint }); }
  if (cur.state !== "preview-ready") out({ ok: false, error: `job is ${cur.state}: adopt needs preview-ready (run status first)` }, 1);
  const c = job.config, src = path.join(film, job.preview.path);
  if (fileSha(src) !== job.preview.sha256) out({ ok: false, error: "preview changed on disk since it was collected" }, 1);
  const pr = ffprobe(src), want = frameCount(c.duration_s, c), srcFps = pr.fps_num / pr.fps_den, tgtFps = c.fps_num / c.fps_den;
  if (pr.frames / srcFps < want / tgtFps - 1 / tgtFps) out({ ok: false, error: `generated clip is ${(pr.frames / srcFps).toFixed(2)} s, shorter than the requested ${c.duration_s} s: not stretched; regenerate with a longer length` }, 1);
  const dest = path.join(dir, "plate.mp4");
  try {
    ffmpeg(["-i", src, "-vf", `scale=${c.width}:${c.height}:force_original_aspect_ratio=increase,crop=${c.width}:${c.height},fps=${c.fps_num}/${c.fps_den},setsar=1`, "-frames:v", String(want), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", dest]);
  } catch (e) { out({ ok: false, error: redact(e.message) }, 1); }
  const asset0 = {
    schema_version: 1, model_id: job.model_id, model_revision: job.model_revision, workflow_digest: job.workflow_digest, prompt: job.prompt, reference_inputs: job.reference_inputs,
    config: { seed: c.seed, aspect: c.aspect, duration_s: c.duration_s, width: c.width, height: c.height, fps_num: c.fps_num, fps_den: c.fps_den },
    provider_job_id: job.provider_job_id, output: { path: `hybrid/generated/${job.job_id}/plate.mp4`, sha256: fileSha(dest) }, cost: { estimate: job.cost_estimate, actual: null },
    licence_note: job.licence_note, provider: job.provider, layer_id: job.layer_id, frames: want, seed_repeatability: "requested; not verified",
  };
  // Plan 06 V4: the accepted plate is an immutable cached asset; the extra fields below are the provenance a later plan or an export reads
  const asset = { ...asset0, ...provenanceOf(job, { outputSha: asset0.output.sha256, outputPath: asset0.output.path, frames: want, ledger: modelLicense(film, job.model_id) }), reference_inputs: asset0.reference_inputs };
  const pv = validateProvenance(JSON.parse(redact(JSON.stringify(asset))));
  if (!pv.ok) out({ ok: false, error: "provenance incomplete: " + pv.problems.join("; ") }, 1);
  const wo = writeOnce(assetP, JSON.parse(redact(JSON.stringify(asset))));
  if (!wo.ok) out({ ok: false, error: wo.error }, 1);
  line(film, redact, cur, job, "accepted", "adopted: conformed to film size/fps/duration");
  const w = writeSources(film, job, asset, c);
  out({ ok: true, job_id: job.job_id, state: "accepted", asset: `hybrid/generated/${job.job_id}/asset.json`, sha256: asset.output.sha256, sources: w.sources, sources_hint: w.hint });
}

function verify() {
  const film = filmDir(), redact = mkRedact(film), { cur, job } = needJob(film);
  const dir = jobDir(film, job.job_id), assetP = path.join(dir, "asset.json"), problems = [];
  if (!["accepted", "delivery-ready"].includes(cur.state) || !fs.existsSync(assetP)) out({ ok: false, error: `job is ${cur.state}: verify needs an adopted plate (accepted)` }, 1);
  const asset = JSON.parse(fs.readFileSync(assetP, "utf8"));
  let file;
  try { file = inside(film, asset.output.path); } catch (e) { problems.push(e.message); }
  const pr = file && fs.existsSync(file) ? ffprobe(file) : null;
  if (!pr) problems.push("plate is missing or not a readable video");
  else {
    if (fileSha(file) !== asset.output.sha256) problems.push("sha256 differs from asset.json");
    const want = frameCount(asset.config.duration_s, asset.config);
    if (pr.frames !== want) problems.push(`frame count ${pr.frames}, expected ${want}`);
    if (pr.width !== asset.config.width || pr.height !== asset.config.height) problems.push(`size ${pr.width}x${pr.height}, expected ${asset.config.width}x${asset.config.height}`);
    if (pr.fps_num * asset.config.fps_den !== asset.config.fps_num * pr.fps_den) problems.push(`fps ${pr.fps_num}/${pr.fps_den}, expected ${asset.config.fps_num}/${asset.config.fps_den}`);
  }
  for (const f of [assetP, path.join(film, "hybrid", "jobs.jsonl"), path.join(dir, "job.json")]) {
    const t = fs.readFileSync(f, "utf8");
    if (t.includes(film) || /\/Users\/|\/home\/[a-z]/.test(t) || (ENV.RASANAI_COMFYUI_TOKEN && t.includes(ENV.RASANAI_COMFYUI_TOKEN))) problems.push(`${path.basename(f)} holds an absolute private path or token`);
  }
  if (problems.length) out({ ok: false, job_id: job.job_id, state: cur.state, problems: problems.map(redact) }, 1);
  if (cur.state === "accepted") line(film, redact, cur, job, "delivery-ready", "verified: sha256, frame count, size and fps match");
  out({ ok: true, job_id: job.job_id, state: "delivery-ready", frames: pr.frames, sha256: asset.output.sha256 });
}

try {
  switch (cmd) {
    case "doctor": await doctor(); break;
    case "list": list(); break;
    case "preview": await preview(); break;
    case "submit": await submit(); break;
    case "status": await status(); break;
    case "cancel": await cancel(); break;
    case "adopt": adopt(); break;
    case "verify": verify(); break;
    default: usage("usage: video-generation.mjs doctor|list|preview|submit|status|cancel|adopt|verify --film <dir> [...] (see the header)");
  }
} catch (e) { out({ ok: false, error: mkRedact(args.film && fs.existsSync(args.film) ? fs.realpathSync(args.film) : null)(e.message) }, 1); }
