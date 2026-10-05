#!/usr/bin/env node
// Copies docs/ to _site/ and stamps the newest RasanAI Studio release (download,
// checksum and release-notes links, version/build text, JSON-LD) into the HTML.
// Node 20+, no dependencies. Never fails the deploy: on any problem it warns and
// leaves the hardcoded fallback values in place.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Newest (published_at) non-draft studio-v* release with a .dmg and its .sha256, or null. */
export function selectRelease(releases) {
  const candidates = [];
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || typeof r.tag_name !== "string" || !r.tag_name.startsWith("studio-v")) continue;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const dmg = assets.find((a) => /\.dmg$/.test(a.name));
    if (!dmg) continue;
    const sha = assets.find((a) => a.name === `${dmg.name}.sha256`);
    if (!sha) continue;
    const when = Date.parse(r.published_at || r.created_at || "");
    candidates.push({ r, dmg, sha, when: Number.isNaN(when) ? 0 : when });
  }
  candidates.sort((a, b) => b.when - a.when);
  const best = candidates[0];
  if (!best) return null;
  const tag = best.r.tag_name;
  return {
    tag,
    version: versionLabel(tag),
    semver: tag.slice("studio-v".length).replace(/-.*$/, ""),
    build: buildFromAsset(best.dmg.name),
    dmgUrl: best.dmg.browser_download_url,
    shaUrl: best.sha.browser_download_url,
    notesUrl: best.r.html_url,
  };
}

/** studio-v0.4.0-beta.1 -> "0.4.0 beta 1"; studio-v1.0.0 -> "1.0.0". */
export function versionLabel(tag) {
  return tag.replace(/^studio-v/, "").replace(/[-.]beta\.(\d+)$/, " beta $1").replace(/-/g, " ");
}

/** RasanAI-Studio-0.4.0-14-arm64-unnotarized.dmg -> "14" (null if absent). */
export function buildFromAsset(name) {
  const m = /^.*?-\d+\.\d+\.\d+(?:-[A-Za-z]+\.?\d*)?-(\d+)-/.exec(name) || /-(\d+)-arm64/.exec(name);
  return m ? m[1] : null;
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Rewrites data-studio links/spans and JSON-LD fields. Returns { html, count }. */
export function stampHtml(html, rel) {
  let count = 0;
  const hrefFor = { dmg: rel.dmgUrl, sha256: rel.shaUrl, notes: rel.notesUrl };
  const textFor = { version: rel.version, build: rel.build };

  html = html.replace(/<a\b[^>]*\bdata-studio="(dmg|sha256|notes)"[^>]*>/g, (tag, kind) => {
    const url = hrefFor[kind];
    if (!url || !/\shref="[^"]*"/.test(tag)) return tag;
    count++;
    return tag.replace(/(\shref=")[^"]*(")/, (_, a, b) => a + escAttr(url) + b);
  });

  html = html.replace(/(<span\b[^>]*\bdata-studio="(version|build)"[^>]*>)[^<]*(<\/span>)/g, (m, open, kind, close) => {
    const text = textFor[kind];
    if (text == null) return m;
    count++;
    return open + escText(text) + close;
  });

  html = html.replace(/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g, (m, open, body, close) => {
    if (!/"name"\s*:\s*"RasanAI Studio"/.test(body)) return m; // only the Studio app entry, not the skill
    const fields = { softwareVersion: rel.semver, downloadUrl: rel.dmgUrl, releaseNotes: rel.notesUrl };
    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;
      body = body.replace(new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`), (mm, pre) => {
        count++;
        return pre + JSON.stringify(value).replace(/</g, "\\u003c");
      });
    }
    return open + body + close;
  });

  return { html, count };
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

async function main() {
  const root = resolve(fileURLToPath(import.meta.url), "../../..");
  const src = join(root, "docs");
  const out = join(root, "_site");
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return console.warn("warning: GITHUB_REPOSITORY not set; keeping fallback values");
  let rel;
  try {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=50`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    rel = selectRelease(await res.json());
  } catch (err) {
    return console.warn(`warning: could not fetch releases (${err.message}); keeping fallback values`);
  }
  if (!rel) return console.warn("warning: no studio-v* release with a .dmg and .sha256 found; keeping fallback values");

  let total = 0;
  for (const file of htmlFiles(out)) {
    const before = readFileSync(file, "utf8");
    const { html, count } = stampHtml(before, rel);
    if (count) {
      writeFileSync(file, html);
      console.log(`  ${file.slice(out.length + 1)}: ${count} replacement(s)`);
      total += count;
    }
  }
  console.log(`Stamped ${rel.tag} (version "${rel.version}", build ${rel.build}) - ${total} replacement(s)`);
  console.log(`  dmg:    ${rel.dmgUrl}\n  sha256: ${rel.shaUrl}\n  notes:  ${rel.notesUrl}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`warning: stamping failed (${err.message}); keeping fallback values`));
}
