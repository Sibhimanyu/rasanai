// Plan 11 R3/R4/R8: containment of inputs, generated code and network access. Policy and checks only: nothing here installs, downloads, deletes or widens a permission.
//
//   resolveInRoots(roots, p)         a path inside one of the approved roots, by REAL path (symlink escapes, traversal, NUL, absolute escapes refused)
//   vetArchiveEntries(entries, o)    a listing is vetted BEFORE anything is written: traversal, absolute, links, devices, count / size / ratio limits
//   parseZipListing / parseTarListing  `unzip -Z` / `tar -tvf` text -> entries
//   extractSafe(file, dest, limits)  list -> vet -> extract into an EMPTY quarantine folder with no-overwrite flags -> verify every path by real path
//   sniffMedia / validateMedia       the type comes from the file's bytes; an extension is only a claim. SVG with active content is refused
//   checkUrl / checkRedirect / resolveAndCheck / guardedFetch   URL ingestion policy: http(s) only, no credentials, no loopback / private / link-local / metadata targets, redirects re-checked,
//                                    credentials never forwarded across origins. The ONE exception is a deliberately configured local endpoint (the optional ComfyUI base), matched by exact origin
//   scanSceneCode(html)              static scan of generated scene code for network, storage, cookie, eval and navigation primitives (a lint, NOT a sandbox)
//   renderEnv(env)                   a minimal environment for a render process: allow-listed names only, nothing secret-shaped, no provider keys
//   renderIsolation(host)            an HONEST capability record: what is enforced, what is available but not wired, what is unavailable
//   boundaryReview()                 the reviewed native bridge / browser origin / IPC surface as capability records (static review, dated, not a pen test)
//   seatbeltProfile / wrapForRender  authored macOS seatbelt profile; opt-in (RASANAI_RENDER_SANDBOX=1), never claimed as verified
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns";
import net from "node:net";
import { spawnSync } from "node:child_process";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };

// ---- file roots -----------------------------------------------------------------------------------------------------------------
// roots: absolute directories the project approved (the film, its library, the user's chosen source folders). -> { ok, path, root } | { ok:false, error, reason }
export function resolveInRoots(roots, candidate, { mustExist = false } = {}) {
  if (typeof candidate !== "string" || !candidate || candidate.includes("\0")) return { ok: false, reason: "invalid", error: "empty or invalid path" };
  const list = (Array.isArray(roots) ? roots : [roots]).map((r) => (typeof r === "string" && r ? real(r) : null)).filter(Boolean);
  if (!list.length) return { ok: false, reason: "no_roots", error: "no approved root exists" };
  for (const root of list) {
    const full = path.resolve(root, candidate);
    if (full !== root && !full.startsWith(root + path.sep)) continue; // lexical escape for this root: try the next root
    let probe = full; while (!fs.existsSync(probe)) { const up = path.dirname(probe); if (up === probe) break; probe = up; }
    const rp = real(probe); if (!rp) continue;
    if (rp !== root && !rp.startsWith(root + path.sep)) return { ok: false, reason: "symlink_escape", error: `a symlink leaves the approved root: ${candidate}` };
    if (mustExist && !fs.existsSync(full)) return { ok: false, reason: "missing", error: `not found: ${candidate}` };
    return { ok: true, path: full, root };
  }
  return { ok: false, reason: "outside_roots", error: `path is outside every approved root: ${candidate}` };
}

// ---- archives -----------------------------------------------------------------------------------------------------------------------
export const ARCHIVE_LIMITS = Object.freeze({ max_entries: 2000, max_total_bytes: 2 * 2 ** 30, max_file_bytes: 1 * 2 ** 30, max_ratio: 100, ratio_floor_bytes: 2 ** 20, max_depth: 12, max_name_length: 240 });
// entries: [{ name, type: "file"|"dir"|"symlink"|"hardlink"|"device"|"other", size, compressed_size?, mode? }]
export function vetArchiveEntries(entries, limits = {}) {
  const L = { ...ARCHIVE_LIMITS, ...limits };
  const problems = []; let total = 0;
  if (!Array.isArray(entries)) return { ok: false, problems: [{ problem: "listing_unreadable" }] };
  if (entries.length > L.max_entries) problems.push({ problem: "too_many_entries", count: entries.length, limit: L.max_entries });
  const seen = new Set();
  for (const e of entries) {
    const name = String(e && e.name || "");
    const norm = name.replace(/\\/g, "/");
    const bad = (problem, extra = {}) => problems.push({ name: name.slice(0, 120), problem, ...extra });
    if (!name || name.includes("\0")) { bad("invalid_name"); continue; }
    if (name.length > L.max_name_length) bad("name_too_long");
    if (norm.startsWith("/") || /^[A-Za-z]:/.test(norm)) bad("absolute_path");
    if (norm.split("/").includes("..")) bad("path_traversal");
    if (norm.split("/").length > L.max_depth) bad("too_deep");
    if (!["file", "dir"].includes(e.type)) bad("link_or_special_entry", { type: e.type }); // symlinks, hardlinks, devices: refused outright
    if (e.mode != null && (Number(e.mode) & 0o6000)) bad("setuid_or_setgid");
    const key = norm.replace(/\/+$/, "").toLowerCase(); if (seen.has(key)) bad("duplicate_or_case_collision"); seen.add(key);
    const size = Number(e.size) || 0; total += size;
    if (size > L.max_file_bytes) bad("file_too_large", { size });
    if (e.compressed_size != null && Number(e.compressed_size) > 0 && size > L.ratio_floor_bytes && size / Number(e.compressed_size) > L.max_ratio) bad("decompression_ratio", { ratio: Math.round(size / Number(e.compressed_size)) });
  }
  if (total > L.max_total_bytes) problems.push({ problem: "total_too_large", total, limit: L.max_total_bytes });
  return { ok: !problems.length, problems, entries: entries.length, total_bytes: total };
}
// `unzip -Z -l`: "-rw-a--     2.0 unx      123 tx      100 defN 20-Oct-25 12:00 dir/file"
export function parseZipListing(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^([-dlcbps])([-rwxsStT]{9})\S*\s+\S+\s+\S+\s+(\d+)\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line);
    if (!m) continue;
    const type = m[1] === "-" ? "file" : m[1] === "d" ? "dir" : m[1] === "l" ? "symlink" : "device";
    out.push({ name: m[5], type, size: Number(m[3]), compressed_size: Number(m[4]), mode: (m[2].includes("s") || m[2].includes("S") ? 0o4000 : 0) });
  }
  return out;
}
// `tar -tvf`: "-rw-r--r--  0 user group   1234 Oct 20 12:00 path"   (links show "path -> target" / "path link to target")
export function parseTarListing(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^([-dlhcbps])([-rwxsStT]{9})\S*\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line) || /^([-dlhcbps])([-rwxsStT]{9})\S*\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line);
    if (!m) continue;
    const type = m[1] === "-" ? "file" : m[1] === "d" ? "dir" : m[1] === "l" ? "symlink" : m[1] === "h" ? "hardlink" : "device";
    out.push({ name: m[4].replace(/ (->|link to) .*$/, ""), type, size: Number(m[3]), mode: (/[sS]/.test(m[2]) ? 0o4000 : 0) });
  }
  return out;
}
// quarantine extraction. `dest` must be an existing EMPTY directory the caller created for this archive; nothing is ever overwritten and nothing is deleted. The archive's own paths are verified AFTER
// extraction by real path as well (defence in depth against a tool that follows a link the listing did not show).
export function extractSafe(file, dest, limits = {}) {
  const isZip = /\.zip$/i.test(file), isTar = /\.(tar|tgz|tar\.gz|tar\.bz2|tar\.xz)$/i.test(file);
  if (!isZip && !isTar) return { ok: false, reason: "unsupported_archive", error: "only .zip and .tar* archives are handled" };
  let d; try { d = fs.statSync(dest); } catch { return { ok: false, reason: "dest_missing", error: "extract into an existing empty folder" }; }
  if (!d.isDirectory() || fs.readdirSync(dest).length) return { ok: false, reason: "dest_not_empty", error: "the destination must be an empty folder created for this archive" };
  const lst = isZip ? spawnSync("unzip", ["-Z", "-l", file], { encoding: "utf8", timeout: 30000 }) : spawnSync("tar", ["-tvf", file], { encoding: "utf8", timeout: 30000 });
  if (lst.status !== 0) return { ok: false, reason: "listing_failed", error: "the archive could not be listed" };
  const entries = isZip ? parseZipListing(lst.stdout) : parseTarListing(lst.stdout);
  if (!entries.length) return { ok: false, reason: "empty_listing", error: "no entries were read from the archive" };
  const vet = vetArchiveEntries(entries, limits);
  if (!vet.ok) return { ok: false, reason: "archive_refused", problems: vet.problems };
  const run = isZip ? spawnSync("unzip", ["-n", "-q", file, "-d", dest], { encoding: "utf8", timeout: 600000 }) : spawnSync("tar", ["-xf", file, "-C", dest, "--no-same-owner", "--no-same-permissions"], { encoding: "utf8", timeout: 600000 });
  if (run.status !== 0 && run.status !== 1) return { ok: false, reason: "extract_failed", error: String(run.stderr || "").slice(0, 200) };
  const rd = real(dest), escaped = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isSymbolicLink()) { escaped.push(p); continue; } const rp = real(p); if (!rp || (rp !== rd && !rp.startsWith(rd + path.sep))) escaped.push(p); else if (e.isDirectory()) walk(p); } };
  walk(dest);
  if (escaped.length) return { ok: false, reason: "post_extract_escape", escaped: escaped.length, note: "left in the quarantine folder untouched; nothing from it is used" };
  return { ok: true, entries: vet.entries, total_bytes: vet.total_bytes, dest };
}

// ---- media by content ----------------------------------------------------------------------------------------------------------------
const SIGS = [
  ["png", "image/png", (b) => b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))],
  ["jpeg", "image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["gif", "image/gif", (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1"))],
  ["webp", "image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["wav", "audio/wav", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE"],
  ["mp4", "video/mp4", (b) => b.subarray(4, 8).toString("latin1") === "ftyp"],
  ["webm", "video/webm", (b) => b.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"))],
  ["mp3", "audio/mpeg", (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)],
  ["flac", "audio/flac", (b) => b.subarray(0, 4).toString("latin1") === "fLaC"],
  ["ogg", "audio/ogg", (b) => b.subarray(0, 4).toString("latin1") === "OggS"],
  ["pdf", "application/pdf", (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"],
  ["zip", "application/zip", (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)],
  ["woff2", "font/woff2", (b) => b.subarray(0, 4).toString("latin1") === "wOF2"],
  ["woff", "font/woff", (b) => b.subarray(0, 4).toString("latin1") === "wOFF"],
  ["otf", "font/otf", (b) => b.subarray(0, 4).toString("latin1") === "OTTO"],
  ["ttf", "font/ttf", (b) => b.subarray(0, 4).equals(Buffer.from("00010000", "hex")) || b.subarray(0, 4).toString("latin1") === "true"],
];
const EXT_KIND = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", wav: "wav", mp4: "mp4", m4v: "mp4", mov: "mp4", webm: "webm", mp3: "mp3", flac: "flac", ogg: "ogg", oga: "ogg", pdf: "pdf", zip: "zip", woff: "woff", woff2: "woff2", otf: "otf", ttf: "ttf", svg: "svg" };
export function sniffMedia(file) {
  let head;
  try { const fd = fs.openSync(file, "r"); try { const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, b.length, 0); head = b.subarray(0, n); } finally { fs.closeSync(fd); } } catch { return { ok: false, kind: null, error: "unreadable" }; }
  if (!head.length) return { ok: false, kind: null, error: "empty file" };
  for (const [kind, mime, test] of SIGS) if (test(head)) return { ok: true, kind, mime };
  const t = head.toString("utf8", 0, Math.min(head.length, 2048)).trimStart().toLowerCase();
  if (/^(<\?xml[^>]*>\s*)?(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(t)) return { ok: true, kind: "svg", mime: "image/svg+xml" };
  if (/^<!doctype html|^<html/.test(t)) return { ok: true, kind: "html", mime: "text/html" };
  return { ok: false, kind: null, error: "content is not a recognised media type" };
}
// allowed: kinds the caller accepts ("png", "mp4", ...). A claimed extension that disagrees with the content is refused. maxBytes: size cap.
export function validateMedia(file, { allowed = [], maxBytes = 4 * 2 ** 30 } = {}) {
  let st; try { st = fs.statSync(file); } catch { return { ok: false, reason: "missing" }; }
  if (!st.isFile()) return { ok: false, reason: "not_a_file" };
  if (st.size > maxBytes) return { ok: false, reason: "too_large", size: st.size };
  const s = sniffMedia(file);
  if (!s.ok) return { ok: false, reason: "unrecognised_content", detail: s.error };
  const claimed = EXT_KIND[path.extname(file).slice(1).toLowerCase()] || null;
  if (claimed && claimed !== s.kind && !(claimed === "mp4" && s.kind === "mp4")) return { ok: false, reason: "extension_mismatch", claimed, actual: s.kind };
  if (allowed.length && !allowed.includes(s.kind)) return { ok: false, reason: "type_not_allowed", actual: s.kind };
  if (s.kind === "svg" || s.kind === "html") {
    const text = fs.readFileSync(file, "utf8");
    const active = svgActiveContent(text);
    if (active.length) return { ok: false, reason: "active_content", kind: s.kind, findings: active };
  }
  return { ok: true, kind: s.kind, mime: s.mime, size: st.size };
}
export function svgActiveContent(text) {
  const f = [];
  if (/<script[\s>]/i.test(text)) f.push("script element");
  if (/\son[a-z]+\s*=/i.test(text)) f.push("event handler attribute");
  if (/javascript:/i.test(text)) f.push("javascript: URL");
  if (/<foreignObject[\s>]/i.test(text)) f.push("foreignObject");
  if (/(?:href|src)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(text)) f.push("external reference");
  if (/<!ENTITY/i.test(text)) f.push("XML entity declaration");
  return f;
}

// ---- URL ingestion policy -----------------------------------------------------------------------------------------------------------
const v4 = (h) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); return m ? m.slice(1).map(Number) : null; };
function blockedV4([a, b, c]) {
  if (a === 0 || a === 10 || a === 127) return "private or loopback IPv4";
  if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT range";
  if (a === 169 && b === 254) return "link-local / cloud metadata address";
  if (a === 172 && b >= 16 && b <= 31) return "private IPv4";
  if (a === 192 && b === 168) return "private IPv4";
  if (a === 192 && b === 0 && c === 0) return "reserved IPv4";
  if (a === 198 && (b === 18 || b === 19)) return "benchmark range";
  if (a >= 224) return "multicast or reserved IPv4";
  return null;
}
function expandV6(h) {
  let s = h.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const m4 = /(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m4) { const q = m4[2].split(".").map(Number); s = m4[1] + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16); }
  const [l, r = null] = s.split("::");
  const L = l ? l.split(":") : [], Rr = r === null ? [] : r ? r.split(":") : [];
  const fill = 8 - L.length - Rr.length;
  const parts = r === null ? L : [...L, ...Array(Math.max(0, fill)).fill("0"), ...Rr];
  return parts.length === 8 ? parts.map((x) => parseInt(x || "0", 16)) : null;
}
function blockedV6(h) {
  const g = expandV6(h); if (!g) return "unparseable IPv6";
  const embedded = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (g.every((x) => x === 0)) return "unspecified IPv6";
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return "IPv6 loopback";
  if ((g[0] & 0xffc0) === 0xfe80) return "IPv6 link-local";
  if ((g[0] & 0xfe00) === 0xfc00) return "IPv6 unique-local (includes the EC2 metadata address)";
  if ((g[0] & 0xff00) === 0xff00) return "IPv6 multicast";
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedV4(embedded(g[6], g[7])) && "IPv4-mapped " + blockedV4(embedded(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedV4(embedded(g[6], g[7])) && "NAT64 " + blockedV4(embedded(g[6], g[7]));
  if (g[0] === 0x2002) return blockedV4(embedded(g[1], g[2])) && "6to4 " + blockedV4(embedded(g[1], g[2]));
  return null;
}
const NAME_BLOCK = /^(localhost|metadata|metadata\.google\.internal|instance-data)$|\.(localhost|local|internal|lan|home|corp|intranet)$/i;
export const originOf = (u) => { try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return null; } };
// opts.allowLocal: [ "http://127.0.0.1:8188" ]: configured local endpoints (the optional ComfyUI base), matched by exact origin. Returns { ok, host, ip_literal, reason?, exception? }
export function checkUrl(urlString, { allowLocal = [] } = {}) {
  let u; try { u = new URL(String(urlString)); } catch { return { ok: false, reason: "not a valid URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: `scheme ${u.protocol} is not allowed (http and https only)` };
  if (u.username || u.password) return { ok: false, reason: "credentials in the URL are refused (they would be forwarded)" };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return { ok: false, reason: "no host" };
  let why = null; const lit = net.isIP(host);
  if (lit === 4) why = blockedV4(v4(host));
  else if (lit === 6) why = blockedV6(host);
  else if (NAME_BLOCK.test(host)) why = "a local or internal host name";
  else if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) why = "a numeric host written in a non-standard form";
  if (!why) return { ok: true, host, ip_literal: !!lit };
  const o = originOf(u.toString());
  if (allowLocal.some((a) => originOf(a) === o)) return { ok: true, host, ip_literal: !!lit, exception: "configured_local_endpoint", note: `${o} is the deliberately configured local endpoint` };
  return { ok: false, host, reason: `blocked target: ${why}` };
}
// a redirect is a NEW request: the target is checked again, https never downgrades, and credentials never follow it to another origin
export function checkRedirect(from, to, opts = {}) {
  let f, t; try { f = new URL(from); t = new URL(to, from); } catch { return { ok: false, reason: "unparseable redirect" }; }
  if (f.protocol === "https:" && t.protocol === "http:") return { ok: false, reason: "redirect downgrades https to http" };
  const c = checkUrl(t.toString(), opts);
  return c.ok ? { ok: true, url: t.toString(), cross_origin: f.origin !== t.origin } : { ok: false, reason: `redirect target refused: ${c.reason}` };
}
const CRED_HEADER = /^(authorization|proxy-authorization|cookie|x-api-key|x-rasa-token|x-auth-token)$/i;
export function forwardHeaders(from, to, headers = {}) {
  const same = originOf(from) === originOf(to);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => same || !CRED_HEADER.test(k)));
}
// literal hosts were judged by checkUrl; a NAME must also not RESOLVE to a blocked address (every address is checked). lookup is injectable.
export async function resolveAndCheck(url, opts = {}) {
  const c = checkUrl(url, opts); if (!c.ok || c.ip_literal || c.exception) return c;
  const lookup = opts.lookup || ((h) => dns.promises.lookup(h, { all: true }));
  let addrs; try { addrs = await lookup(c.host); } catch (e) { return { ok: false, host: c.host, reason: `the host did not resolve (${(e && e.code) || "error"})` }; }
  for (const a of addrs) { const ip = a.address; const why = net.isIP(ip) === 4 ? blockedV4(v4(ip)) : blockedV6(ip); if (why) return { ok: false, host: c.host, reason: `the name resolves to a blocked address: ${why}` }; }
  return { ok: true, host: c.host, resolved: addrs.map((a) => a.address) };
}
export class UrlPolicyError extends Error { constructor(reason, url) { super(`URL refused by the ingestion policy: ${reason}`); this.policy = true; this.reason = reason; this.url = url; } }
// fetch with the policy: manual redirects (max 5), every hop re-checked, credential headers stripped across origins, a timeout. Limitation (recorded in boundaryReview): the name is resolved
// here and again by fetch, so a DNS rebinding window remains; a network-level egress rule is the only full answer.
export async function guardedFetch(url, { headers = {}, init = {}, timeoutMs = 15000, maxRedirects = 5, allowLocal = [], lookup } = {}) {
  let cur = String(url), first = cur;
  for (let hops = 0; ; hops++) {
    const v = await resolveAndCheck(cur, { allowLocal, lookup }); if (!v.ok) throw new UrlPolicyError(v.reason, cur);
    const r = await fetch(cur, { ...init, headers: forwardHeaders(first, cur, headers), redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!loc) return r;
    if (hops >= maxRedirects) throw new UrlPolicyError("too many redirects", cur);
    const rd = checkRedirect(cur, loc, { allowLocal }); if (!rd.ok) throw new UrlPolicyError(rd.reason, cur);
    cur = rd.url;
  }
}

// ---- generated scene code ---------------------------------------------------------------------------------------------------------------
const SCENE_RULES = [
  ["network_call", /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b\s*[(.]?/],
  ["dynamic_import", /\bimport\s*\(|\bimportScripts\s*\(/],
  ["remote_resource", /(?:src|href|action|poster|data)\s*=\s*["']\s*(?:https?:)?\/\/(?!localhost|127\.0\.0\.1)/i],
  ["css_remote", /url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+(?:url\()?["']?\s*(?:https?:)?\/\//i],
  ["eval", /\beval\s*\(|\bnew\s+Function\s*\(|\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/],
  ["storage_or_cookie", /\b(document\.cookie|localStorage|sessionStorage|indexedDB)\b/],
  ["navigation", /\b(window\.open|location\.(href|assign|replace)\s*=?|top\.location|parent\.location)\b/],
  ["frame_or_base", /<\s*(iframe|object|embed|base)[\s>]/i],
  ["file_scheme", /file:\/\//i],
  ["cross_window", /\b(postMessage|opener|parent\.)\b/],
];
// -> { ok, findings:[{kind,line,excerpt}], boundary:false }. A lint for the ordinary scene (scenes load vendored GSAP / three from local paths and read staged assets by relative URL).
// It cannot prove safety and is NEVER presented as a sandbox: see renderIsolation().
export function scanSceneCode(source) {
  const findings = [];
  String(source).split("\n").forEach((line, i) => { for (const [kind, re] of SCENE_RULES) if (re.test(line)) findings.push({ kind, line: i + 1, excerpt: line.trim().slice(0, 120) }); });
  return { ok: !findings.length, findings, boundary: false, note: "static scan only; generated scene code can still run scripts. Isolation is reported separately by renderIsolation()" };
}

// ---- render process environment ----------------------------------------------------------------------------------------------------------
const ENV_ALLOW = new Set(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SHELL", "USER", "LOGNAME", "DISPLAY", "NODE_ENV", "NODE_PATH", "FORCE_COLOR", "NO_COLOR", "CI", "RASANAI_SLOT_OWNER", "RASANAI_MANAGED", "RASANAI_RENDER_SLOTS", "PUPPETEER_EXECUTABLE_PATH", "CHROME_PATH", "FFMPEG_PATH", "FFPROBE_PATH", "HYPERFRAMES_CHROME_PATH"]);
const SECRET_NAME = /(key|token|secret|passw|credential|auth|cookie|session|bearer|anthropic|openai|eleven|stability|higgs|google|aws|azure|gcp|github|gh_|npm_|netrc|ssh|signing|apple_id|notar)/i;
// allow-list only; a name that LOOKS secret is dropped even if someone added it to `extra`. The render never sees the director's provider keys.
export function renderEnv(env = process.env, { extra = [] } = {}) {
  const out = {}, dropped = [];
  for (const [k, v] of Object.entries(env)) {
    const wanted = ENV_ALLOW.has(k) || extra.includes(k) || /^(LC_|HYPERFRAMES_(?!.*(KEY|TOKEN|SECRET)))/.test(k);
    if (wanted && !SECRET_NAME.test(k)) out[k] = v; else dropped.push(k);
  }
  return { env: out, dropped_count: dropped.length, dropped_secret_like: dropped.filter((k) => SECRET_NAME.test(k)).length };
}

// what the render call sites actually pass: EVERYTHING the renderer needs (npx, Chromium, ffmpeg find their own settings) minus secret-shaped variables. The strict allow-list above is for the
// sandboxed path. RASANAI_RENDER_KEEP_ENV=1 turns the scrub off (a person's explicit choice).
export function renderProcessEnv(env = process.env) {
  if (env.RASANAI_RENDER_KEEP_ENV === "1") return { ...env };
  const out = {}; for (const [k, v] of Object.entries(env)) if (!SECRET_NAME.test(k)) out[k] = v;
  return out;
}

// ---- honest isolation records ---------------------------------------------------------------------------------------------------------------
export function renderIsolation({ platform = process.platform, exists = (p) => fs.existsSync(p), env = process.env } = {}) {
  const seatbelt = platform === "darwin" && exists("/usr/bin/sandbox-exec");
  const optedIn = env.RASANAI_RENDER_SANDBOX === "1";
  const rows = [
    { id: "render_env_minimal", enforced: true, how: "renderProcessEnv(): variables with secret-shaped names (keys, tokens, auth, cookies, provider names) are removed before `hyperframes render` starts (finish.mjs, reel.mjs, lib/slot.mjs runInSlot); renderEnv() is the strict allow-list for the sandboxed path", scope: "render processes started by finish.mjs, reel.mjs and slot.mjs run; RASANAI_RENDER_KEEP_ENV=1 turns it off" },
    { id: "headless_chromium", enforced: false, claimed_as_boundary: false, how: "headless Chromium is a rendering engine, not a security boundary for untrusted scene code" },
    { id: "network_blocked_for_render", enforced: seatbelt && optedIn, available: seatbelt, verified: false, how: seatbelt ? "macOS seatbelt profile (deny network*) via wrapForRender when RASANAI_RENDER_SANDBOX=1" : "no OS sandbox found: network is NOT blocked for render processes", disclosure: seatbelt && optedIn ? "opt-in profile is on; its coverage of a given Chromium build is unverified" : "scene code is linted (scanSceneCode) and rendered from staged local assets, but network access is not technically prevented" },
    { id: "filesystem_limited_for_render", enforced: seatbelt && optedIn, available: seatbelt, verified: false, how: seatbelt ? "seatbelt profile restricts writes to the staging and output folders" : "unavailable: a render process can read what the user account can read" },
    { id: "provider_credentials_outside_render", enforced: true, how: "keys live in the keychain / provider stores and the render environment is scrubbed" },
  ];
  return { schema_version: 1, platform, os_sandbox: seatbelt ? "sandbox-exec present (deprecated by Apple, still shipped)" : "none found", rows, honest_summary: seatbelt && optedIn ? "network and write limits are applied through an opt-in seatbelt profile; unverified until tested in Plan 14" : "no operating-system sandbox is applied to render processes: generated scene code is constrained by lint and a scrubbed environment only. Features that run untrusted third-party scene code should stay restricted." };
}
export function seatbeltProfile({ stageDir, outDir, readRoots = [] } = {}) {
  const q = (p) => JSON.stringify(path.resolve(p));
  const lines = ["(version 1)", "(deny default)", "(allow process-fork)", "(allow process-exec)", "(allow signal (target self))", "(allow sysctl-read)", "(allow mach-lookup)", "(allow file-read-metadata)",
    '(allow file-read* (subpath "/usr") (subpath "/System") (subpath "/Library") (subpath "/bin") (subpath "/private/etc") (subpath "/dev") (subpath "/opt/homebrew"))'];
  for (const r of readRoots.filter(Boolean)) lines.push(`(allow file-read* (subpath ${q(r)}))`);
  for (const w of [stageDir, outDir, os.tmpdir()].filter(Boolean)) lines.push(`(allow file-read* file-write* (subpath ${q(w)}))`);
  lines.push("(deny network*)");
  return lines.join("\n") + "\n";
}
// opt-in only; returns the argv unchanged (and says so) otherwise
export function wrapForRender(argv, { stageDir, outDir, readRoots = [], env = process.env } = {}) {
  const iso = renderIsolation({ env });
  if (!(env.RASANAI_RENDER_SANDBOX === "1" && iso.rows.find((r) => r.id === "network_blocked_for_render").available)) return { argv, sandboxed: false, note: iso.honest_summary };
  return { argv: ["/usr/bin/sandbox-exec", "-p", seatbeltProfile({ stageDir, outDir, readRoots }), ...argv], sandboxed: true, verified: false, note: iso.honest_summary };
}

// ---- reviewed boundary (static, dated) ---------------------------------------------------------------------------------------------------------
// What was read in this checkout on 2026-10-25. A capability record says what exists and what does not; none of it is a penetration test.
export function boundaryReview() {
  return {
    schema_version: 1, reviewed_at: "2026-10-25", method: "code reading only; nothing was executed",
    surfaces: [
      { id: "director_console_http", where: "scripts/console.mjs", finding: "binds 127.0.0.1 only; Host header must be 127.0.0.1:<port> or localhost:<port> (421 otherwise); POSTs need the per-session token header; the page needs a SameSite=Strict HttpOnly cookie set by the tokened URL", gap: "no Origin header check on POST (the custom token header already forces a CORS preflight); the session token appears in the console URL printed to the terminal", enforcement: "partial" },
      { id: "studio_native_bridge", where: "apps/macos/Sources (no WKWebView / script message handler found)", finding: "Studio is native SwiftUI: no embedded web console, no JS-to-native bridge methods to review", gap: "none found", enforcement: "not_applicable" },
      { id: "studio_to_engine_ipc", where: "Runtime/director-driver.mjs, action lines and run files", finding: "file-based transport under the run folder; signals (SIGUSR1/2, SIGTERM) go to the driver process group", gap: "any process running as the same user can write the run files; no signing of action lines", enforcement: "user_account_only" },
      { id: "scene_code_origin", where: "stage3d.mjs local server, hyperframes render", finding: "scenes are loaded from local files or a loopback server", gap: "no isolated origin per scene; network is not blocked for render processes unless the opt-in seatbelt profile is used", enforcement: "unavailable" },
      { id: "url_ingestion", where: "lib/logos.mjs, lib/brand-assets.mjs (user-supplied URLs)", finding: "go through lib/containment.mjs guardedFetch (blocked targets, re-checked redirects, no credential forwarding)", gap: "a DNS rebinding window remains between the resolve check and the fetch", enforcement: "policy_in_process" },
      { id: "fixed_provider_endpoints", where: "music.mjs, fonts.mjs, update.mjs, video-generation/providers.mjs", finding: "fixed vendor endpoints and the configured ComfyUI base (a deliberate local exception); keys come from the keychain/provider store", gap: "music.mjs track mirrors come from a reviewed list, not user input", enforcement: "by_construction" },
    ],
  };
}
