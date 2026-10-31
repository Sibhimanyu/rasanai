// Small ONNX vision models for the art department, run with onnxruntime-node (already on the Mac under the hyperframes cache).
//   depth:  Depth Anything V2 Small (Apache-2.0)  -> a relative depth map, near = 1
//   matte:  BiRefNet lite (MIT)                    -> a general object / background matte (people, products, animals, castles)
// Weights are downloaded on demand into $RASANAI_MODELS (default ~/.cache/rasanai/models), checked against a sha256, and never
// run at film-render time: the tools bake a PNG once. Licences and sources: third_party/SOURCES.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { readImage, resizePlane } from "./png-io.mjs";

export const MODELS = {
  depth: { file: "depth-anything-v2-small.onnx", url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx", sha256: "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c", size: 99060839, licence: "Apache-2.0" },
  matte: { file: "birefnet-lite.onnx", url: "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx", sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333", size: 224005088, licence: "MIT" },
};
export const modelDir = () => process.env.RASANAI_MODELS || path.join(os.homedir(), ".cache", "rasanai", "models");

function loadOrt() {
  const tries = [];
  if (process.env.RASANAI_ORT) tries.push(process.env.RASANAI_ORT);
  const opt = path.join(os.homedir(), ".cache", "hyperframes", "optional");
  try { for (const d of fs.readdirSync(opt)) if (d.startsWith("onnxruntime-node")) tries.push(path.join(opt, d, "package.json")); } catch { /* none */ }
  tries.push(path.join(process.cwd(), "package.json"));
  for (const t of tries) { try { return createRequire(t)("onnxruntime-node"); } catch { /* next */ } }
  throw new Error("onnxruntime-node not found: it is expected under ~/.cache/hyperframes/optional/ (run npx hyperframes remove-background once), or set RASANAI_ORT to a package.json beside node_modules/onnxruntime-node");
}
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

export async function ensureModel(kind) {
  const m = MODELS[kind];
  if (!m) throw new Error(`unknown model ${kind}`);
  const f = path.join(modelDir(), m.file);
  if (fs.existsSync(f) && fs.statSync(f).size === m.size) return f;
  if (/^(0|false|no|off)$/i.test(process.env.RASANAI_MODEL_DOWNLOAD || "")) throw new Error(`${m.file} is not in ${modelDir()} and RASANAI_MODEL_DOWNLOAD=off`);
  fs.mkdirSync(modelDir(), { recursive: true });
  process.stderr.write(`NOTE: downloading ${m.file} (${Math.round(m.size / 1e6)} MB, ${m.licence}) into ${modelDir()}\n`);
  const res = await fetch(m.url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${m.url}`);
  const tmp = f + ".part";
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  if (sha(tmp) !== m.sha256) { fs.rmSync(tmp, { force: true }); throw new Error(`${m.file}: sha256 does not match the pinned weights`); }
  fs.renameSync(tmp, f);
  return f;
}
const sessions = new Map();
async function session(kind) {
  if (sessions.has(kind)) return sessions.get(kind);
  const ort = loadOrt(), file = await ensureModel(kind);
  const s = await ort.InferenceSession.create(file, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
  const v = { ort, s };
  sessions.set(kind, v);
  return v;
}
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
function chw(img, mean = MEAN, std = STD) {
  const { w, h, data } = img, o = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) o[c * w * h + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];
  return o;
}

// -> {w, h, v: Float32Array 0..1 (near = 1)} at the picture's own size. `size` = the short side the model sees (a multiple of 14; 518 default)
export async function depthMap(inp, { size = 518, flip = false } = {}) {
  const src = readImage(inp);
  const k = size / Math.min(src.w, src.h);
  const mw = Math.max(14, Math.min(1036, Math.round((src.w * k) / 14) * 14)), mh = Math.max(14, Math.min(1036, Math.round((src.h * k) / 14) * 14));
  const small = readImage(inp, { exact: { w: mw, h: mh } });
  const { ort, s } = await session("depth");
  const out = await s.run({ pixel_values: new ort.Tensor("float32", chw(small), [1, 3, mh, mw]) });
  const t = out[s.outputNames[0]], d = t.data, [oh, ow] = t.dims.slice(-2);
  // robust normalisation: 1st to 99th percentile to 0..1 (the model's output is relative inverse depth: bigger = nearer)
  const sorted = Float32Array.from(d).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)], span = Math.max(1e-6, hi - lo);
  const n = new Float32Array(d.length);
  for (let i = 0; i < n.length; i++) { const v = Math.max(0, Math.min(1, (d[i] - lo) / span)); n[i] = flip ? 1 - v : v; }
  return { w: src.w, h: src.h, v: resizePlane(n, ow, oh, src.w, src.h), model: MODELS.depth.file };
}

// -> {w, h, v: Float32Array 0..1 alpha} the foreground matte of any picture (BiRefNet lite, 1024 x 1024 in, sigmoid out)
export async function objectMatte(inp) {
  const src = readImage(inp), S = 1024;
  const small = readImage(inp, { exact: { w: S, h: S } });
  const { ort, s } = await session("matte");
  const out = await s.run({ input_image: new ort.Tensor("float32", chw(small), [1, 3, S, S]) });
  const t = out[s.outputNames[0]], d = t.data;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < d.length; i += 7) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
  const logits = mn < -0.001 || mx > 1.001; // raw logits need a sigmoid, probabilities do not
  const m = new Float32Array(d.length);
  for (let i = 0; i < m.length; i++) m[i] = logits ? 1 / (1 + Math.exp(-d[i])) : d[i];
  return { w: src.w, h: src.h, v: resizePlane(m, S, S, src.w, src.h), model: MODELS.matte.file };
}
