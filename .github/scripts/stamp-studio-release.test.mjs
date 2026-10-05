import test from "node:test";
import assert from "node:assert/strict";
import { selectRelease, versionLabel, buildFromAsset, stampHtml } from "./stamp-studio-release.mjs";

const rel = (tag, date, extra = {}) => ({
  tag_name: tag, published_at: date, draft: false, prerelease: true,
  html_url: `https://github.com/o/r/releases/tag/${tag}`,
  assets: [
    { name: `RasanAI-Studio-9.9.9-77-arm64-unnotarized.dmg`, browser_download_url: `https://x/${tag}/a.dmg` },
    { name: `RasanAI-Studio-9.9.9-77-arm64-unnotarized.dmg.sha256`, browser_download_url: `https://x/${tag}/a.dmg.sha256` },
  ], ...extra,
});

test("labels and builds", () => {
  assert.equal(versionLabel("studio-v0.4.0-beta.1"), "0.4.0 beta 1");
  assert.equal(versionLabel("studio-v1.0.0"), "1.0.0");
  assert.equal(buildFromAsset("RasanAI-Studio-0.4.0-14-arm64-unnotarized.dmg"), "14");
  assert.equal(buildFromAsset("RasanAI-Studio-1.0.0-120-arm64.dmg"), "120");
});

test("picks newest valid studio release", () => {
  const picked = selectRelease([
    rel("v1.6.0", "2026-12-01T00:00:00Z"),
    rel("studio-v0.5.0-beta.1", "2026-11-01T00:00:00Z", { draft: true }),
    rel("studio-v0.4.0-beta.1", "2026-10-05T00:00:00Z"),
    rel("studio-v0.6.0-beta.2", "2026-10-20T00:00:00Z", { assets: [] }),
    rel("studio-v0.5.0-beta.3", "2026-10-10T00:00:00Z"),
  ]);
  assert.equal(picked.tag, "studio-v0.5.0-beta.3");
  assert.equal(picked.version, "0.5.0 beta 3");
  assert.equal(picked.semver, "0.5.0");
  assert.equal(picked.build, "77");
  assert.equal(selectRelease([rel("v1.0.0", "2026-01-01T00:00:00Z")]), null);
  assert.equal(selectRelease(null), null);
});

test("stamps links, spans and JSON-LD", () => {
  const r = selectRelease([rel("studio-v1.0.0", "2026-10-10T00:00:00Z")]);
  const src = `<a class="btn" data-studio="dmg" href="old">d</a><a data-studio="sha256" href="old">s</a><a href="old" data-studio="notes">n</a><a href="keep">k</a>
<span data-studio="version">0.4.0 beta 1</span> build <span data-studio="build">14</span>
<script type="application/ld+json">{"name":"RasanAI Studio","softwareVersion":"0.4.0","downloadUrl":"old","releaseNotes":"old"}</script>`;
  const { html, count } = stampHtml(src, r);
  assert.equal(count, 8);
  assert.match(html, /data-studio="dmg" href="https:\/\/x\/studio-v1.0.0\/a.dmg"/);
  assert.match(html, /<a href="https:\/\/github.com\/o\/r\/releases\/tag\/studio-v1.0.0" data-studio="notes">/);
  assert.match(html, /<a href="keep">/);
  assert.match(html, /<span data-studio="version">1.0.0<\/span> build <span data-studio="build">77<\/span>/);
  assert.match(html, /"softwareVersion":"1.0.0","downloadUrl":"https:\/\/x\/studio-v1.0.0\/a.dmg"/);
});
