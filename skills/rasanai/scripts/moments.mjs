#!/usr/bin/env node
// Reference moments: real motion from real launch films, as measured specs and code, used for TECHNIQUE only.
// A moment is a short slice of someone else's film with a role (hook, proof, turn, cta), mechanic tags and a credit.
// The public manifest is fetched at run time and cached; bundles are downloaded only for the user's own film, verified
// by sha256 and kept read-only in the run. Nothing is vendored into the skill and nothing from a moment ships in a film.
//
//   node moments.mjs list   [--role hook|proof|turn|cta] [--mechanic <tag>[,<tag>]] [--query "<words>"] [--limit 20] [--no-network]
//   node moments.mjs search (same flags as list)
//        -> rows: id, role, name, mechanic[], swapSlot[], why, duration, clip, still, credit {handle, name, url}
//   node moments.mjs fetch <id> --run <run> [--role <role>] [--no-network]
//        -> downloads the bundle, checks its sha256, extracts it read-only under <run>/references/moments/<id>/ and records
//           the credit in <run>/references/moments/credits.json (every moment used, with its creator and source URL)
//   node moments.mjs credits --run <run>      -> the credits, and the line the Final's notes carry
// Offline (--no-network, or the network fails): the cached manifest; with no cache, an empty list and the fallback: the
// library's own motion styles (library.mjs search --type motion).
// Env (tests, mirrors): RASANAI_MOMENTS_MANIFEST (a URL or a file), RASANAI_MOMENTS_BUNDLES (a URL or a folder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";

export const MANIFEST_URL = "https://static.heygen.ai/hyperframes-oss/desktop/moments/v3/manifest.json";
export const BUNDLES_URL = "https://static.heygen.ai/hyperframes-oss/desktop/moments/bundles/";
const ROLES = ["hook", "setup", "proof", "turn", "payoff", "cta"];
const CACHE = path.join(STATE_DIR, "cache", "moments");
const FALLBACK = "no reference moments available (offline and nothing cached): use the library's own motion styles (node scripts/library.mjs search --type motion --q \"<mechanic>\") and say so in the decisions";
export const USE_NOTE = "Reference moments are used for technique only: one mechanic per beat is rebuilt fresh with this film's own content. No footage, frames, code, copy, brand or audio from a moment is shipped in the film.";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const offline = () => !!(args["no-network"] || args.offline || process.env.RASANAI_OFFLINE);
const isUrl = (s) => /^https?:\/\//i.test(String(s || ""));

async function get(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

// the manifest: live when we can, else the cache; returns { rows, source, base, note }
export async function manifest({ noNetwork = false } = {}) {
  const src = process.env.RASANAI_MOMENTS_MANIFEST || MANIFEST_URL;
  const cacheFile = path.join(CACHE, "manifest.json");
  let raw = null, source = null, note = null;
  if (!noNetwork) {
    try {
      raw = isUrl(src) ? (await get(src)).toString("utf8") : fs.readFileSync(src.replace(/^file:\/\//, ""), "utf8");
      JSON.parse(raw);
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(cacheFile, raw);
      source = "live";
    } catch (e) { raw = null; note = `could not fetch the manifest (${e.message}): using the cache`; }
  }
  if (raw == null && fs.existsSync(cacheFile)) { raw = fs.readFileSync(cacheFile, "utf8"); source = "cache"; }
  if (raw == null) return { rows: [], source: "none", base: null, note: FALLBACK };
  let data;
  try { data = JSON.parse(raw); } catch { return { rows: [], source, base: null, note: "the cached manifest is not valid JSON: " + FALLBACK }; }
  const list = Array.isArray(data) ? data : data.moments || data.rows || [];
  const base = isUrl(src) ? src.replace(/[^/]*$/, "") : null;
  // rows the gallery keeps off the page (real faces, takedowns) are never offered
  const rows = list.filter((r) => r && r.id && (typeof r.on_page !== "string" || r.on_page === "yes") && !r.format_skill);
  return { rows, source, base, note };
}

const abs = (base, p) => (!p ? null : isUrl(p) || !base ? p : base + p);
export function rowOut(r, base) {
  return {
    id: r.id, role: r.role || null, name: r.name || "", mechanic: r.mechanic || [], swapSlot: r.swap_slot || [], why: r.why || "", duration: r.duration_s ?? null,
    clip: abs(base, r.clip), still: abs(base, r.still),
    credit: { handle: r.author_handle || null, name: r.x_author_name || r.author_name || null, url: r.x_url || r.source_url || null, film: r.film_title || null },
  };
}
export function filterRows(rows, { role, mechanic, query } = {}) {
  const mech = String(mechanic || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  return rows.filter((r) => (!role || r.role === role) && mech.every((m) => (r.mechanic || []).map((x) => String(x).toLowerCase()).includes(m)))
    .map((r) => ({ r, s: words.length ? words.filter((w) => `${r.name} ${r.why} ${(r.mechanic || []).join(" ")} ${r.film_title || ""}`.toLowerCase().includes(w)).length : 1 }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.r);
}

async function bundleBytes(row, noNetwork) {
  const sha = row.bundle && row.bundle.sha256;
  if (!/^[a-f0-9]{64}$/.test(String(sha || ""))) throw new Error(`moment ${row.id} has no bundle`);
  const cached = path.join(CACHE, "bundles", `${sha}.tar.gz`);
  if (fs.existsSync(cached)) return { buf: fs.readFileSync(cached), from: "cache" };
  if (noNetwork) throw new Error(`moment ${row.id}: the bundle is not cached and the network is off`);
  const key = row.bundle.key || `${row.id}/${sha}/bundle.tar.gz`;
  const base = process.env.RASANAI_MOMENTS_BUNDLES || BUNDLES_URL;
  const buf = isUrl(base) ? await get(base.replace(/\/?$/, "/") + key, 60000) : fs.readFileSync(path.join(base, key));
  return { buf, from: "network" };
}

// download, verify, extract read-only, credit
export async function fetchMoment(id, run, { role = null, noNetwork = false } = {}) {
  const m = await manifest({ noNetwork });
  const row = m.rows.find((r) => r.id === id);
  if (!row) throw new Error(m.rows.length ? `no moment ${id} in the manifest (${m.source})` : `no moment ${id}: ${m.note}`);
  const { buf, from } = await bundleBytes(row, noNetwork);
  const got = crypto.createHash("sha256").update(buf).digest("hex");
  if (got !== row.bundle.sha256) throw new Error(`moment ${id}: the bundle's sha256 is ${got.slice(0, 12)}..., the manifest says ${row.bundle.sha256.slice(0, 12)}...; refusing it`);
  if (row.bundle.bytes && buf.length !== row.bundle.bytes) throw new Error(`moment ${id}: ${buf.length} bytes, the manifest says ${row.bundle.bytes}`);
  fs.mkdirSync(path.join(CACHE, "bundles"), { recursive: true });
  const cached = path.join(CACHE, "bundles", `${got}.tar.gz`);
  if (!fs.existsSync(cached)) fs.writeFileSync(cached, buf);
  const root = path.join(run, "references", "moments");
  const dest = path.join(root, id);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-moment-"));
  try {
    const tgz = path.join(tmp, "bundle.tar.gz");
    fs.writeFileSync(tgz, buf);
    const ls = spawnSync("tar", ["-tzf", tgz], { encoding: "utf8" });
    if (ls.status !== 0) throw new Error(`moment ${id}: the bundle is not a readable tar.gz`);
    const bad = ls.stdout.split("\n").filter(Boolean).filter((p) => p.startsWith("/") || p.split("/").includes(".."));
    if (bad.length) throw new Error(`moment ${id}: the bundle has unsafe paths (${bad[0]}); refusing it`);
    const xd = path.join(tmp, "x");
    fs.mkdirSync(xd);
    const x = spawnSync("tar", ["-xzf", tgz, "-C", xd], { encoding: "utf8" });
    if (x.status !== 0) throw new Error(`moment ${id}: could not extract (${(x.stderr || "").trim()})`);
    if (fs.existsSync(dest)) { spawnSync("chmod", ["-R", "u+w", dest]); fs.rmSync(dest, { recursive: true, force: true }); }
    fs.mkdirSync(root, { recursive: true });
    fs.cpSync(xd, dest, { recursive: true });
    fs.writeFileSync(path.join(dest, ".moment.json"), JSON.stringify({ id, sha256: got, role: role || row.role, credit: rowOut(row, m.base).credit, use: USE_NOTE }, null, 2));
    spawnSync("chmod", ["-R", "a-w", dest]); // read-only: a motion reference, never edited, never copied in wholesale
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const credits = readCredits(run);
  const entry = { id, role: role || row.role || null, name: row.name || "", mechanic: row.mechanic || [], ...rowOut(row, m.base).credit, source_url: rowOut(row, m.base).credit.url, clip: abs(m.base, row.clip), sha256: got, fetched: new Date().toISOString() };
  credits.moments = [...credits.moments.filter((c) => c.id !== id), entry];
  credits.note = USE_NOTE;
  fs.writeFileSync(path.join(root, "credits.json"), JSON.stringify(credits, null, 2));
  const files = listFiles(dest).map((f) => path.relative(dest, f));
  return { id, dir: dest, from, sha256: got, files: files.slice(0, 40), read: files.filter((f) => /(^|\/)(dense\.md|REMIX\.md|index\.html)$/.test(f)), credit: entry };
}
function listFiles(d) { const o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o.push(...listFiles(p)); else o.push(p); } return o; }
export function readCredits(run) {
  const f = path.join(run, "references", "moments", "credits.json");
  try { const j = JSON.parse(fs.readFileSync(f, "utf8")); return { moments: Array.isArray(j.moments) ? j.moments : [], note: j.note || USE_NOTE }; } catch { return { moments: [], note: USE_NOTE }; }
}
export function creditLine(credits) {
  if (!credits.moments.length) return null;
  return `Motion references (technique only, nothing shipped): ${credits.moments.map((c) => `${c.handle || c.name || "unknown"}${c.film ? ` ("${c.film}")` : ""}${c.source_url ? ` ${c.source_url}` : ""}`).join("; ")}.`;
}

if (cmd === "list" || cmd === "search") {
  const m = await manifest({ noNetwork: offline() });
  const role = args.role && args.role !== true ? String(args.role) : null;
  if (role && !ROLES.includes(role)) die(`--role must be one of ${ROLES.join(", ")}`);
  const rows = filterRows(m.rows, { role, mechanic: args.mechanic !== true ? args.mechanic : null, query: args.query !== true ? args.query || args.q : null }).slice(0, Number(args.limit) || 20).map((r) => rowOut(r, m.base));
  out({ ok: true, source: m.source, count: rows.length, total: m.rows.length, note: m.note || undefined, fallback: m.rows.length ? undefined : FALLBACK, use: USE_NOTE, rows });
} else if (cmd === "fetch") {
  const id = args._[1] ? String(args._[1]) : die("usage: moments.mjs fetch <id> --run <run>");
  if (!args.run || args.run === true) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  if (!fs.existsSync(run)) die(`run dir not found: ${run}`);
  try {
    const r = await fetchMoment(id, run, { role: args.role && args.role !== true ? String(args.role) : null, noNetwork: offline() });
    out({ ok: true, ...r, dir: path.relative(process.cwd(), r.dir), use: USE_NOTE, take_rule: "Take ONE mechanic as one sentence (what moves, on which axis, how long, what never stops) and build it fresh with this film's content; leave its copy, brand, bookends and frame tables behind (references/craft.md, The take rule)." });
  } catch (e) { out({ ok: false, id, error: e.message, fallback: FALLBACK }, 2); }
} else if (cmd === "credits") {
  if (!args.run || args.run === true) die("--run <run dir> required");
  const c = readCredits(path.resolve(String(args.run)));
  out({ ok: true, ...c, final_note: creditLine(c) });
} else {
  die("usage: moments.mjs list|search|fetch|credits (see the header)");
}
