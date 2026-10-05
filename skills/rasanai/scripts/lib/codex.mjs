// Codex CLI discovery for image generation. Zero dependencies (Node >= 20).
//   findCodex(env)            -> absolute path of the codex binary, or null
//   codexHome(env)            -> $CODEX_HOME or ~/.codex
//   imageModels(env)          -> ordered model candidates (RASANAI_IMAGE_MODEL, remembered, the cache's listed models, gpt-5.5)
//   loginStatus(bin, env)     -> { signed_in, auth: "chatgpt" | "api-key" | null, text }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const isExe = (p) => {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
};

export function findCodex(env = process.env) {
  const home = env.HOME || os.homedir();
  if (env.RASANAI_CODEX_BIN) return isExe(env.RASANAI_CODEX_BIN) ? path.resolve(env.RASANAI_CODEX_BIN) : null;
  const dirs = [
    ...String(env.PATH || "").split(path.delimiter).filter(Boolean),
    path.join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".npm-global", "bin"),
  ];
  for (const d of dirs) { const p = path.join(d, "codex"); if (isExe(p)) return p; }
  const app = "/Applications/Codex.app/Contents/Resources/codex";
  return isExe(app) ? app : null;
}

export function codexHome(env = process.env) {
  return env.CODEX_HOME || path.join(env.HOME || os.homedir(), ".codex");
}

// where the working model is remembered between calls
export function memoryFile(env = process.env) {
  return path.join(env.RASANAI_HOME || path.join(env.HOME || os.homedir(), ".rasanai"), "imagegen.json");
}

export function rememberedModel(env = process.env) {
  try { return JSON.parse(fs.readFileSync(memoryFile(env), "utf8")).model || null; } catch { return null; }
}

export function rememberModel(model, env = process.env) {
  try {
    const f = memoryFile(env);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
    fs.writeFileSync(f, JSON.stringify({ ...cur, model, at: new Date().toISOString() }, null, 2));
  } catch {}
}

export function forgetModel(env = process.env) {
  try { fs.rmSync(memoryFile(env), { force: true }); } catch {}
}

export function imageModels(env = process.env) {
  const out = [];
  const add = (m) => { if (m && !out.includes(m)) out.push(m); };
  add(env.RASANAI_IMAGE_MODEL);
  add(rememberedModel(env));
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(codexHome(env), "models_cache.json"), "utf8"));
    (cache.models || [])
      .filter((m) => m && m.slug && m.visibility === "list")
      .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9))
      .forEach((m) => add(m.slug));
  } catch {}
  add("gpt-5.5");
  return out;
}

export function loginStatus(bin, env = process.env) {
  if (!bin) return { signed_in: false, auth: null, text: "" };
  const r = spawnSync(bin, ["login", "status"], { encoding: "utf8", env, timeout: 8000, stdio: ["ignore", "pipe", "pipe"] });
  const text = `${r.stdout || ""}${r.stderr || ""}`.trim();
  const signed_in = r.status === 0 && /logged in/i.test(text);
  const auth = !signed_in ? null : /api[ -]?key/i.test(text) ? "api-key" : "chatgpt";
  return { signed_in, auth, text };
}
