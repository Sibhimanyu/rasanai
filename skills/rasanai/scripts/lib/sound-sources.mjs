// Sound source adapters, used only when their key is set (or, for ACE-Step, when the person has installed it). Nothing is shipped, borrowed or installed.
// The person's own `--track` always wins over every adapter (music.mjs: the "user" source comes first and stops the chain).
//   adapters()                      -> [{id, kind: "music"|"sfx"|"tts", on, why, licence, caveat}]
//   elevenMusic({prompt, seconds, out})   ElevenLabs Music        (key ELEVENLABS_API_KEY or RASANAI_ELEVENLABS_API_KEY)
//   elevenSfx({prompt, seconds, out})     ElevenLabs sound effects (same key)
//   stableAudio({prompt, seconds, out})   Stable Audio 2 API       (STABILITY_API_KEY or RASANAI_STABILITY_API_KEY)
//   freesoundSfx({query, out, minS, maxS}) Freesound, CC0 only     (FREESOUND_API_KEY)
//   aceStep({prompt, seconds, out, lyrics}) a local ACE-Step install run as an isolated child process (ACESTEP_CMD)
// Each returns { file, vendor, licence, caveat, prompt } and throws on failure; callers record licence + caveat in LICENSES.json.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const env = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || null;
export const KEY = {
  eleven: () => env("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"),
  stable: () => env("RASANAI_STABILITY_API_KEY", "STABILITY_API_KEY"),
  freesound: () => env("RASANAI_FREESOUND_API_KEY", "FREESOUND_API_KEY"),
  acestep: () => env("ACESTEP_CMD"),
};
const UA = "RasanAI/sound-sources";

// licence caveats, printed whenever an adapter is used. (verify) = a secondary source said it; check the vendor's own terms page.
export const CAVEATS = {
  elevenlabs: "ElevenLabs film/ad use is UNVERIFIED: one 2026 guide says self-serve plans exclude film, TV and studio games; Enterprise covers them. Commercial rights start on the paid Starter tier. Confirm on elevenlabs.io/terms before a launch film is used as an ad, and record the plan active on the generation date.",
  stable: "Stable Audio: commercial use under the Stability AI terms or Community Licence (revenue thresholds apply) (verify). Record the plan and the generation date.",
  freesound: "Freesound: only CC0 files are used (filter license:'Creative Commons 0'), so no attribution is needed; the file's own licence page is saved. CC BY and CC BY-NC are never pulled.",
  acestep: "ACE-Step runs locally from the person's own install; weights licence (Apache-2.0 / MIT family) must be checked against the model card of the exact version installed (verify). Never installed by RasanAI.",
};
export const warn = (id, log = (m) => process.stderr.write(m + "\n")) => log(`sound: licence caveat (${id}): ${CAVEATS[id]}`);

export function adapters() {
  return [
    { id: "elevenlabs-music", kind: "music", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs },
    { id: "elevenlabs-sfx", kind: "sfx", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs },
    { id: "elevenlabs-tts", kind: "tts", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY (scripts/vo.mjs)", licence: "vendor plan; disclose an AI voice", caveat: CAVEATS.elevenlabs },
    { id: "stable-audio", kind: "music+sfx", on: !!KEY.stable(), why: "STABILITY_API_KEY", licence: "Stability terms / Community Licence", caveat: CAVEATS.stable },
    { id: "freesound-cc0", kind: "sfx", on: !!KEY.freesound(), why: "FREESOUND_API_KEY", licence: "CC0 only", caveat: CAVEATS.freesound },
    { id: "ace-step-local", kind: "music", on: !!KEY.acestep() && fs.existsSync(String(KEY.acestep()).split(/\s+/)[0]), why: "ACESTEP_CMD (an executable that takes --prompt --duration --out [--lyrics])", licence: "per model card", caveat: CAVEATS.acestep },
  ];
}

const need = (k, what) => { if (!k) throw new Error(`${what} is not set`); return k; };
const save = (out, bytes) => { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, bytes); return out; };
const base = () => process.env.RASANAI_ELEVENLABS_API_BASE || "https://api.elevenlabs.io";

export async function elevenMusic({ prompt, seconds, out }) {
  const key = need(KEY.eleven(), "ELEVENLABS_API_KEY");
  const res = await fetch(`${base()}/v1/music?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), music_length_ms: Math.round(Math.min(300, Math.max(10, seconds)) * 1000), model_id: "music_v1", force_instrumental: true }), signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`ElevenLabs Music HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "elevenlabs/music_v1", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs, prompt, date: new Date().toISOString() };
}
export async function elevenSfx({ prompt, seconds = 2, out }) {
  const key = need(KEY.eleven(), "ELEVENLABS_API_KEY");
  const res = await fetch(`${base()}/v1/sound-generation?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ text: prompt, duration_seconds: Math.min(22, Math.max(0.5, seconds)), prompt_influence: 0.4 }), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`ElevenLabs SFX HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "elevenlabs/sound-generation", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs, prompt, date: new Date().toISOString() };
}
export async function stableAudio({ prompt, seconds, out }) {
  const key = need(KEY.stable(), "STABILITY_API_KEY");
  const form = new FormData();
  form.set("prompt", String(prompt).slice(0, 900));
  form.set("duration", String(Math.min(190, Math.max(1, Math.ceil(seconds)))));
  form.set("output_format", "mp3");
  const res = await fetch("https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio", { method: "POST", headers: { authorization: `Bearer ${key}`, accept: "audio/*", "user-agent": UA }, body: form, signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`Stable Audio HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "stability/stable-audio-2", licence: "Stability terms at generation time", caveat: CAVEATS.stable, prompt, date: new Date().toISOString() };
}
// CC0 only: the licence filter is applied by Freesound and checked again on every result. The HQ preview is used (an original needs the person's OAuth login).
export async function freesoundSfx({ query, out, minS = 0.2, maxS = 6 }) {
  const token = need(KEY.freesound(), "FREESOUND_API_KEY");
  const u = new URL("https://freesound.org/apiv2/search/text/");
  u.searchParams.set("query", query);
  u.searchParams.set("filter", `license:"Creative Commons 0" duration:[${minS} TO ${maxS}]`);
  u.searchParams.set("fields", "id,name,username,license,url,duration,previews");
  u.searchParams.set("sort", "rating_desc");
  u.searchParams.set("page_size", "5");
  u.searchParams.set("token", token);
  const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Freesound HTTP ${res.status}`);
  const hit = ((await res.json()).results || []).find((r) => /publicdomain\/zero|Creative Commons 0/i.test(r.license) && r.previews && r.previews["preview-hq-mp3"]);
  if (!hit) throw new Error(`Freesound: no CC0 result for "${query}"`);
  const a = await fetch(hit.previews["preview-hq-mp3"], { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!a.ok) throw new Error(`Freesound preview HTTP ${a.status}`);
  return { file: save(out, Buffer.from(await a.arrayBuffer())), vendor: "freesound", licence: "CC0-1.0", caveat: CAVEATS.freesound, url: hit.url, id: hit.id, title: hit.name, author: hit.username, duration: hit.duration, prompt: query, date: new Date().toISOString() };
}
// A local ACE-Step install, run as a separate process so its Python stack (PyTorch, never librosa/numba here) cannot take this process down.
// ACESTEP_CMD is an executable (a wrapper script the person wrote or the project's CLI) taking: --prompt <text> --duration <s> --out <wav> [--lyrics <file>].
export async function aceStep({ prompt, seconds, out, lyrics }) {
  const cmd = need(KEY.acestep(), "ACESTEP_CMD").split(/\s+/);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const argv = [...cmd.slice(1), "--prompt", prompt, "--duration", String(Math.round(seconds)), "--out", out];
  if (lyrics) { const lf = out + ".lyrics.txt"; fs.writeFileSync(lf, lyrics); argv.push("--lyrics", lf); }
  const r = spawnSync(cmd[0], argv, { encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 1 << 26, env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" } });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`ACE-Step failed: ${(r.stderr || r.error || "").toString().trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
  return { file: out, vendor: "ace-step/local", licence: "per the installed model card", caveat: CAVEATS.acestep, prompt, date: new Date().toISOString() };
}
