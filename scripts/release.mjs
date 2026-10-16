#!/usr/bin/env node
// One-command releases for RasanAI (skill) and RasanAI Studio (Mac app).
//
//   node scripts/release.mjs skill  <x.y.z> --title "<headline>"
//   node scripts/release.mjs studio <x.y.z> [--build N] [--title "<headline>"]
//   node scripts/release.mjs verify-studio
//   node scripts/release.mjs status
//   add --dry-run to print every step without side effects
//
// Node 20+, no dependencies; needs git, gh (logged in), and on macOS hdiutil, ditto, PlistBuddy.
// Every step checks whether it is already done and skips; state lives in .release-state/ (gitignored).
// All repo edits happen in a temporary worktree off origin/master; the caller's tree is never touched.
// See RELEASING.md.
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "Sibhimanyu/rasanai";
const ACCOUNT = "rasanai-studio";
const FEED_URL = "https://sibhimanyu.github.io/rasanai/studio/appcast.xml";
const SKILL_FILES = {
  version: "skills/rasanai/VERSION",
  bridge: "skills/rasa-director/VERSION",
  plugin: ".claude-plugin/plugin.json",
  market: ".claude-plugin/marketplace.json",
  changelog: "CHANGELOG.md",
};
const STUDIO_PLIST = "apps/macos/Info.plist";
const STUDIO_CHANGELOG = "apps/macos/CHANGELOG.md";
const APPCAST = "docs/studio/appcast.xml";
const INSTALL_DOC = "apps/macos/COMMUNITY-INSTALL.md";
const SITE_DOWNLOAD_PAGES = ["docs/index.html", "docs/guide.html"];

// Point the site's download links (DMG, checksum, release notes) and its version labels at a Studio release.
// Studio releases are prereleases, so GitHub's releases/latest URL would serve the skill release instead.
function pointSiteAt(dir, tag, dmgName, version, beta) {
  for (const rel of SITE_DOWNLOAD_PAGES) {
    const p = join(dir, rel);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, "utf8")
      .replace(/releases\/download\/studio-v[^/"]+\/RasanAI-Studio-[^"]+?\.dmg(\.sha256)?"/g, (_, sha) => `releases/download/${tag}/${dmgName}${sha || ""}"`)
      .replace(/releases\/tag\/studio-v[^"]+"/g, `releases/tag/${tag}"`)
      .replace(/(<span data-studio="version">)[^<]*(<\/span>)/g, `$1${version} beta ${beta}$2`)
      .replace(/("name":"RasanAI Studio"[^}]*?"softwareVersion":")[^"]*"/, `$1${version}"`);
    writeFileSync(p, html);
  }
}

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--title", "--build"].includes(argv[i - 1])));

// ---------- plumbing ----------
const log = (m = "") => console.log(m);
const step = (m) => log(`\n== ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, { cwd = ROOT, allowFail = false, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, input });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}): ${(r.stderr || r.stdout || "").trim()}`);
  }
  return { out: (r.stdout || "").trim(), err: (r.stderr || "").trim(), code: r.status };
}
const git = (args, o) => run("git", args, o).out;
const gh = (args, o) => run("gh", args, o).out;
const ghJson = (args, o) => JSON.parse(gh(args, o) || "null");
const masterFile = (path) => git(["show", `origin/master:${path}`]);
const fetchMaster = () => git(["fetch", "origin", "master", "--quiet"]);

async function until(label, fn, { timeoutMs = 600000, everyMs = 10000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label} after ${Math.round(timeoutMs / 1000)}s`);
    await sleep(everyMs);
  }
}

async function retry(label, fn, tries = 5) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      log(`   ${label} failed (attempt ${i}/${tries}): ${String(e.message).split("\n")[0]}`);
      await sleep(3000 * i);
    }
  }
  throw last;
}

function withWorktree(name, fn) {
  const dir = mkdtempSync(join(tmpdir(), `rasanai-rel-${name}-`));
  rmSync(dir, { recursive: true, force: true });
  return (async () => {
    try {
      return await fn(dir);
    } finally {
      run("git", ["worktree", "remove", "--force", dir], { allowFail: true });
      rmSync(dir, { recursive: true, force: true });
      run("git", ["worktree", "prune"], { allowFail: true });
    }
  })();
}

// ---------- state ----------
let STATE = {};
let STATE_PATH = null;
function loadState(kind, version) {
  const dir = join(ROOT, ".release-state");
  mkdirSync(dir, { recursive: true });
  STATE_PATH = join(dir, `${kind}-${version}.json`);
  STATE = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {};
}
const save = () => {
  if (!DRY && STATE_PATH) writeFileSync(STATE_PATH, JSON.stringify(STATE, null, 2) + "\n");
};

// ---------- text helpers ----------
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const semver = (v) => /^\d+\.\d+\.\d+$/.test(v || "");
const cmpVer = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Body of the section whose heading line matches `headRe` (up to the next "## "), trimmed. */
function sectionBody(text, headRe) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => headRe.test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j])) j++;
  return lines.slice(i + 1, j).join("\n").trim();
}
function replaceHeading(text, headRe, newHeading) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => headRe.test(l));
  if (i < 0) return null;
  lines[i] = newHeading;
  return lines.join("\n");
}

// ---------- feed ----------
function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const get = (re) => (b.match(re) || [])[1];
    items.push({
      raw: m[0],
      title: get(/<title>([\s\S]*?)<\/title>/),
      pubDate: get(/<pubDate>([\s\S]*?)<\/pubDate>/),
      version: get(/<sparkle:version>([\s\S]*?)<\/sparkle:version>/),
      short: get(/<sparkle:shortVersionString>([\s\S]*?)<\/sparkle:shortVersionString>/),
      minOS: get(/<sparkle:minimumSystemVersion>([\s\S]*?)<\/sparkle:minimumSystemVersion>/),
      hw: get(/<sparkle:hardwareRequirements>([\s\S]*?)<\/sparkle:hardwareRequirements>/),
      url: get(/<enclosure url="([^"]+)"/),
      sig: get(/sparkle:edSignature="([^"]+)"/),
      length: Number(get(/length="(\d+)"/)),
    });
  }
  return items;
}
async function liveFeed() {
  const res = await fetch(`${FEED_URL}?cb=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`Live feed returned HTTP ${res.status}`);
  return parseItems(await res.text());
}
const maxBuild = (items) => Math.max(0, ...items.map((i) => Number(i.version) || 0));

function plistGet(path, key) {
  return run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path]).out;
}
function plistFromText(text, key) {
  const m = text.match(new RegExp(`<key>${esc(key)}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : null;
}

// ---------- GitHub helpers ----------
function findPr(branch) {
  const prs = ghJson(["pr", "list", "-R", REPO, "--head", branch, "--state", "all", "--limit", "10", "--json", "number,state,mergeCommit,url"]) || [];
  return prs.find((p) => p.state === "MERGED") || prs.find((p) => p.state === "OPEN") || null;
}
const viewPr = (n) => ghJson(["pr", "view", String(n), "-R", REPO, "--json", "number,state,mergeCommit,url"]);

/**
 * Two steps that put a change on master: open a PR from a fresh branch, then squash-merge it and wait for MERGED.
 * cfg: { branch, title, body, commitMsg, edit(dir), landed() -> string|false, landedSha() }
 */
function landSteps(key, cfg) {
  const st = () => {
    const s = (STATE[key] ||= {});
    s.branch = cfg.branch;
    return s;
  };
  const getPr = () => {
    const s = st();
    if (s.pr) {
      const p = viewPr(s.pr);
      if (p && p.state !== "CLOSED") return p;
    }
    return findPr(cfg.branch);
  };
  return [
    {
      name: `${key}: open PR (${cfg.branch})`,
      desc: `branch ${cfg.branch} from origin/master in a temp worktree, edit, commit, push, gh pr create`,
      done: async () => {
        fetchMaster();
        const l = cfg.landed();
        if (l) return l;
        const p = getPr();
        return p ? `PR #${p.number} ${p.state}` : false;
      },
      run: async () => {
        fetchMaster();
        await withWorktree(key, async (dir) => {
          git(["worktree", "add", "-B", cfg.branch, dir, "origin/master"]);
          cfg.edit(dir);
          git(["add", "-A"], { cwd: dir });
          const trailer = process.env.RELEASE_COAUTHOR ? `\n\nCo-Authored-By: ${process.env.RELEASE_COAUTHOR}` : "";
          git(["commit", "-q", "-m", cfg.commitMsg + trailer], { cwd: dir });
          git(["push", "--force", "-u", "origin", cfg.branch], { cwd: dir });
        });
        const url = gh(["pr", "create", "-R", REPO, "--base", "master", "--head", cfg.branch, "--title", cfg.title, "--body", cfg.body]);
        const p = findPr(cfg.branch);
        st().pr = p.number;
        log(`   ${url}`);
      },
    },
    {
      name: `${key}: squash-merge and wait for MERGED`,
      desc: `gh pr merge --squash --admin, then poll gh pr view until MERGED (the branch is deleted only afterwards)`,
      done: async () => {
        const l = cfg.landed();
        const p = getPr();
        if (p && p.state === "MERGED") {
          st().pr = p.number;
          st().mergeSha = p.mergeCommit?.oid;
          return `PR #${p.number} MERGED`;
        }
        if (l && !p) {
          st().mergeSha ||= cfg.landedSha();
          return l;
        }
        return false;
      },
      run: async () => {
        const p = getPr();
        if (!p) throw new Error(`No PR found for ${cfg.branch}`);
        st().pr = p.number;
        if (p.state === "OPEN") {
          const r = run("gh", ["pr", "merge", String(p.number), "-R", REPO, "--squash", "--admin"], { allowFail: true });
          if (r.code !== 0 && !/already used by worktree/i.test(r.err)) {
            // The merge can succeed server-side even when gh complains; the state below is the truth.
            log(`   gh pr merge said: ${r.err.split("\n")[0]}`);
          }
        }
        const merged = await until(`PR #${p.number} to be MERGED`, () => {
          const v = viewPr(p.number);
          if (v.state === "CLOSED") throw new Error(`PR #${p.number} was closed without merging (${v.url}). Resume to open a new one.`);
          return v.state === "MERGED" ? v : false;
        }, { timeoutMs: 300000, everyMs: 5000 });
        st().mergeSha = merged.mergeCommit.oid;
        log(`   MERGED ${merged.url} (${st().mergeSha.slice(0, 9)})`);
        fetchMaster();
      },
    },
  ];
}

function deleteBranchStep(keys) {
  return {
    name: "clean up merged branches",
    desc: "delete each release branch, only if its PR is MERGED",
    done: async () => (keys.every((k) => STATE[k]?.branchDeleted) ? "already deleted" : false),
    run: async () => {
      for (const k of keys) {
        const s = STATE[k];
        if (!s || s.branchDeleted) continue;
        const p = findPr(s.branch);
        if (!p || p.state !== "MERGED") {
          log(`   keeping ${s.branch}: its PR is not MERGED`);
          continue;
        }
        run("gh", ["api", "-X", "DELETE", `repos/${REPO}/git/refs/heads/${s.branch}`], { allowFail: true });
        run("git", ["branch", "-D", s.branch], { allowFail: true });
        s.branchDeleted = true;
        log(`   deleted ${s.branch}`);
      }
    },
  };
}

async function runSteps(steps) {
  for (const s of steps) {
    step(s.name);
    let d;
    try {
      d = await s.done?.();
    } catch (e) {
      if (!DRY) throw e;
      d = false;
    }
    if (d) {
      log(`   skip: ${d === true ? "already done" : d}`);
      continue;
    }
    if (DRY) {
      log(`   [dry-run] would: ${s.desc}`);
      continue;
    }
    await s.run();
    save();
  }
}

// ---------- skill ----------
async function releaseSkill(version) {
  if (!semver(version)) throw new Error("Usage: release.mjs skill <x.y.z> --title \"<headline>\"");
  loadState("skill", version);
  const title = flag("--title") || STATE.title;
  const tag = `v${version}`;
  fetchMaster();
  const cur = masterFile(SKILL_FILES.version).trim();
  const onMaster = () => cur === version && /^## \S+ \(/m.test(masterFile(SKILL_FILES.changelog)) && new RegExp(`^## ${esc(version)} \\(`, "m").test(masterFile(SKILL_FILES.changelog));
  if (!onMaster() && cmpVer(version, cur) <= 0) throw new Error(`Version ${version} must be above master's ${cur}.`);
  if (!onMaster() && !title) throw new Error('Pass --title "<headline>" (it becomes the CHANGELOG heading and the release title).');
  if (title) STATE.title = title;
  save();

  const steps = landSteps("bump", {
    branch: `Sibhimanyu/release-${version}`,
    title: `RasanAI ${version}`,
    body: `Release RasanAI ${version}: ${title || ""}\n\nBumps skills/rasanai/VERSION, skills/rasa-director/VERSION, .claude-plugin/plugin.json and the rasa-director entry in marketplace.json; turns CHANGELOG's Unreleased into ${version}.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
    commitMsg: `RasanAI ${version}`,
    landed: () => (onMaster() ? `master already at ${version}` : false),
    landedSha: () => git(["log", "-1", "--format=%H", "origin/master", "--", SKILL_FILES.version]),
    edit: (dir) => {
      const p = (f) => join(dir, f);
      writeFileSync(p(SKILL_FILES.version), version + "\n");
      writeFileSync(p(SKILL_FILES.bridge), version + "\n");
      const plugin = readFileSync(p(SKILL_FILES.plugin), "utf8");
      const plugin2 = plugin.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
      if (plugin2 === plugin && !plugin.includes(`"version": "${version}"`)) throw new Error("plugin.json: version not found");
      writeFileSync(p(SKILL_FILES.plugin), plugin2);
      const market = readFileSync(p(SKILL_FILES.market), "utf8");
      const market2 = market.replace(/("name":\s*"rasa-director"[\s\S]*?"version":\s*")[^"]+(")/, `$1${version}$2`);
      if (market2 === market && !market.includes(`"version": "${version}"`)) throw new Error("marketplace.json: rasa-director version not found");
      writeFileSync(p(SKILL_FILES.market), market2);
      const cl = readFileSync(p(SKILL_FILES.changelog), "utf8");
      const body = sectionBody(cl, /^## Unreleased\s*$/);
      if (!body) throw new Error("CHANGELOG.md has no non-empty '## Unreleased' section to release.");
      writeFileSync(p(SKILL_FILES.changelog), replaceHeading(cl, /^## Unreleased\s*$/, `## ${version} (${today()}): ${title}`));
    },
  });

  steps.push(
    {
      name: `tag ${tag} on the merge commit`,
      desc: `git push origin <merge sha>:refs/tags/${tag}`,
      done: async () => (git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`]) ? `tag ${tag} exists` : false),
      run: async () => {
        const sha = STATE.bump?.mergeSha;
        if (!sha) throw new Error("No merge commit recorded for the release PR.");
        git(["push", "origin", `${sha}:refs/tags/${tag}`]);
        log(`   ${tag} -> ${sha.slice(0, 9)}`);
      },
    },
    {
      name: `GitHub release ${tag}`,
      desc: `gh release create ${tag} --latest with the CHANGELOG section as notes`,
      done: async () => (run("gh", ["release", "view", tag, "-R", REPO], { allowFail: true }).code === 0 ? `release ${tag} exists` : false),
      run: async () => {
        fetchMaster();
        const cl = masterFile(SKILL_FILES.changelog);
        const head = cl.split("\n").find((l) => new RegExp(`^## ${esc(version)} \\(`).test(l));
        const m = head.match(/^## \S+ \([\d-]+\):\s*(.*)$/);
        const relTitle = `RasanAI ${version}: ${m ? m[1] : title}`;
        const notes = join(mkdtempSync(join(tmpdir(), "rasanai-notes-")), "notes.md");
        writeFileSync(notes, sectionBody(cl, new RegExp(`^## ${esc(version)} \\(`)) + "\n");
        gh(["release", "create", tag, "-R", REPO, "--verify-tag", "--latest", "--title", relTitle, "--notes-file", notes]);
        log(`   https://github.com/${REPO}/releases/tag/${tag}`);
      },
    },
    deleteBranchStep(["bump"]),
  );
  await runSteps(steps);
  log(DRY ? "\n[dry-run] done; nothing was changed." : `\nRasanAI ${version} is released.`);
}

// ---------- sparkle ----------
function findSparkleBin() {
  const cands = [
    process.env.SPARKLE_BIN,
    join(ROOT, "apps/macos/.build/artifacts/sparkle/Sparkle/bin"),
    "/Users/sibhi-zstch1643/conductor/repos/greenroom/.sparkle-tools/bin",
    join(homedir(), ".cache/rasanai-release/sparkle/bin"),
  ].filter(Boolean);
  for (const c of cands) if (existsSync(join(c, "sign_update")) && existsSync(join(c, "generate_keys"))) return c;
  const cache = join(homedir(), ".cache/rasanai-release/sparkle");
  log("   downloading Sparkle release tools to a cache...");
  mkdirSync(cache, { recursive: true });
  const assets = gh(["api", "repos/sparkle-project/Sparkle/releases/latest", "--jq", ".assets[].browser_download_url"]).split("\n");
  const url = assets.find((u) => /\/Sparkle-[\d.]+\.tar\.xz$/.test(u));
  if (!url) throw new Error("Could not find the Sparkle release tarball; set SPARKLE_BIN.");
  const tar = join(cache, "sparkle.tar.xz");
  run("curl", ["-fL", "--retry", "3", "-o", tar, url]);
  run("tar", ["-xJf", tar, "-C", cache]);
  const bin = join(cache, "bin");
  if (!existsSync(join(bin, "sign_update"))) throw new Error(`Sparkle tools not found in ${bin}; set SPARKLE_BIN.`);
  return bin;
}
function ed25519Verify(fileBytes, sigB64, pubB64) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubB64, "base64")]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  return edVerify(null, fileBytes, key, Buffer.from(sigB64, "base64"));
}
const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const keychainPublicKey = (bin) => {
  const m = run(join(bin, "generate_keys"), ["--account", ACCOUNT, "-p"]).out.match(/[A-Za-z0-9+/]{43}=/);
  if (!m) throw new Error("Could not read the public key for the keychain account " + ACCOUNT);
  return m[0];
};

// ---------- studio ----------
async function releaseStudio(version) {
  if (!semver(version)) throw new Error("Usage: release.mjs studio <x.y.z> [--build N] [--title \"<headline>\"]");
  loadState("studio", version);
  fetchMaster();
  const plist = masterFile(STUDIO_PLIST);
  const plistVer = plistFromText(plist, "CFBundleShortVersionString");
  const plistBuild = Number(plistFromText(plist, "CFBundleVersion"));
  const feed = await liveFeed();
  const clMaster = masterFile(STUDIO_CHANGELOG);
  const bumped = plistVer === version && new RegExp(`^## ${esc(version)} \\(build \\d+\\)`, "m").test(clMaster);

  let build = flag("--build") ? Number(flag("--build")) : STATE.build;
  if (!build) build = bumped ? plistBuild : Math.max(maxBuild(feed), plistBuild) + 1;
  if (!Number.isInteger(build) || build < 1) throw new Error("Bad build number.");
  if (!bumped && build <= Math.max(maxBuild(feed), plistBuild)) throw new Error(`Build ${build} must be above the live feed (${maxBuild(feed)}) and master (${plistBuild}).`);
  if (!bumped && cmpVer(version, plistVer) < 0) throw new Error(`Version ${version} is below master's ${plistVer}.`);
  STATE.build = build;
  if (flag("--title")) STATE.title = flag("--title");
  save();
  log(`Studio ${version} build ${build}${bumped ? " (bump already on master)" : ""}; live feed top is ${feed[0]?.short} (${feed[0]?.version}).`);

  const dist = join(ROOT, ".release-state", `studio-${version}-artifacts`);
  const sparkle = () => (STATE.sparkleBin ||= findSparkleBin());
  const bundledSkill = () => masterFile(SKILL_FILES.version).trim();

  const steps = landSteps("bump", {
    branch: `Sibhimanyu/studio-${version}`,
    title: `Studio ${version} (build ${build})`,
    body: `Release RasanAI Studio ${version} (build ${build}): bumps Info.plist and turns the Studio CHANGELOG's Unreleased into the version heading.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
    commitMsg: `Studio ${version} (build ${build})`,
    landed: () => (bumped ? `master already at ${version} (build ${plistBuild})` : false),
    landedSha: () => git(["log", "-1", "--format=%H", "origin/master", "--", STUDIO_PLIST]),
    edit: (dir) => {
      const pp = join(dir, STUDIO_PLIST);
      let t = readFileSync(pp, "utf8");
      t = t.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${version}$2`);
      t = t.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${build}$2`);
      writeFileSync(pp, t);
      const cp = join(dir, STUDIO_CHANGELOG);
      const cl = readFileSync(cp, "utf8");
      const body = sectionBody(cl, /^## Unreleased\s*$/);
      if (!body) throw new Error("apps/macos/CHANGELOG.md has no non-empty '## Unreleased' section to release.");
      let out = replaceHeading(cl, /^## Unreleased\s*$/, `## ${version} (build ${build}) — ${today()}`);
      if (!/Bundles RasanAI/i.test(body)) {
        const skillVer = readFileSync(join(dir, SKILL_FILES.version), "utf8").trim();
        const lines = out.split("\n");
        const h = lines.findIndex((l) => l.startsWith(`## ${version} (build`));
        let end = h + 1;
        while (end < lines.length && !/^## /.test(lines[end])) end++;
        while (end > h + 1 && lines[end - 1].trim() === "") end--;
        lines.splice(end, 0, `- **Bundles RasanAI ${skillVer}.**`);
        out = lines.join("\n");
      }
      writeFileSync(cp, out);
    },
  });

  // The workflow run
  steps.push(
    {
      name: "dispatch studio-release-candidate.yml on master",
      desc: `gh workflow run studio-release-candidate.yml --ref master -f version=${version} -f build=${build} -f enable_updates=true`,
      done: async () => (STATE.runId ? `run ${STATE.runId} already dispatched` : false),
      run: async () => {
        const list = () => ghJson(["run", "list", "-R", REPO, "--workflow", "studio-release-candidate.yml", "--limit", "20", "--json", "databaseId"]).map((r) => r.databaseId);
        const before = new Set(list());
        gh(["workflow", "run", "studio-release-candidate.yml", "-R", REPO, "--ref", "master", "-f", `version=${version}`, "-f", `build=${build}`, "-f", "enable_updates=true"]);
        const id = await until("the dispatched run to appear", () => list().find((i) => !before.has(i)), { timeoutMs: 120000, everyMs: 4000 });
        STATE.runId = id;
        log(`   run ${id}: https://github.com/${REPO}/actions/runs/${id}`);
      },
    },
    {
      name: "watch the build",
      desc: "poll the run until it completes; it must succeed",
      done: async () => {
        if (!STATE.runId) return false;
        const r = ghJson(["run", "view", String(STATE.runId), "-R", REPO, "--json", "status,conclusion"]);
        return r.status === "completed" && r.conclusion === "success" ? `run ${STATE.runId} succeeded` : false;
      },
      run: async () => {
        const r = await until("the build to finish", () => {
          const v = ghJson(["run", "view", String(STATE.runId), "-R", REPO, "--json", "status,conclusion"]);
          if (v.status === "completed") return v;
          log(`   ${v.status}...`);
          return false;
        }, { timeoutMs: 3600000, everyMs: 30000 });
        if (r.conclusion !== "success") {
          const id = STATE.runId;
          delete STATE.runId;
          save();
          throw new Error(`Build run ${id} ended ${r.conclusion}: https://github.com/${REPO}/actions/runs/${id} (resume re-dispatches it)`);
        }
      },
    },
    {
      name: "download the DMG artifact",
      desc: "gh run download studio-community-candidate, with retries",
      done: async () => (STATE.dmg && existsSync(STATE.dmg) ? `have ${STATE.dmg}` : false),
      run: async () => {
        rmSync(dist, { recursive: true, force: true });
        mkdirSync(dist, { recursive: true });
        await retry("artifact download", async () => {
          rmSync(dist, { recursive: true, force: true });
          mkdirSync(dist, { recursive: true });
          gh(["run", "download", String(STATE.runId), "-R", REPO, "-n", "studio-community-candidate", "-D", dist]);
        });
        const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
        const files = walk(dist);
        const dmg = files.find((f) => f.endsWith(".dmg"));
        if (!dmg) throw new Error("Artifact has no .dmg");
        STATE.dmg = dmg;
        STATE.sha256File = files.find((f) => f.endsWith(".sha256"));
        delete STATE.verifiedSha;
        delete STATE.signature;
      },
    },
    {
      name: "verify the DMG's app, copy it to .context/studio-latest",
      desc: "hdiutil attach -nobrowse -readonly, check version/build/key/feed URL, ditto the app out, detach",
      done: async () => (STATE.dmg && STATE.verifiedSha === sha256File(STATE.dmg) ? "already verified" : false),
      run: async () => {
        const sha = sha256File(STATE.dmg);
        if (STATE.sha256File) {
          const want = readFileSync(STATE.sha256File, "utf8").trim().split(/\s+/)[0];
          if (want !== sha) throw new Error(`DMG sha256 ${sha} does not match its .sha256 file (${want}).`);
        }
        const mp = mkdtempSync(join(tmpdir(), "rasanai-dmg-"));
        run("hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mp, STATE.dmg]);
        try {
          const app = readdirSync(mp).find((n) => n.endsWith(".app"));
          if (!app) throw new Error("No .app inside the DMG");
          const info = join(mp, app, "Contents/Info.plist");
          const gotVer = plistGet(info, "CFBundleShortVersionString");
          const gotBuild = plistGet(info, "CFBundleVersion");
          if (gotVer !== version || Number(gotBuild) !== build) throw new Error(`DMG app is ${gotVer} (${gotBuild}), expected ${version} (${build}).`);
          const embedded = plistGet(info, "SUPublicEDKey");
          const masterKey = plistFromText(plist, "SUPublicEDKey");
          if (embedded !== masterKey) throw new Error("The DMG's SUPublicEDKey differs from master's Info.plist.");
          const keychain = keychainPublicKey(sparkle());
          if (keychain !== embedded) throw new Error("The keychain signing key (" + ACCOUNT + ") does not match the app's embedded SUPublicEDKey.");
          const feedUrl = plistGet(info, "SUFeedURL");
          if (feedUrl !== FEED_URL) throw new Error(`The app's SUFeedURL is ${feedUrl}; updates are not enabled in this build.`);
          const dest = join(ROOT, ".context/studio-latest/RasanAI Studio.app");
          rmSync(dirname(dest), { recursive: true, force: true });
          mkdirSync(dirname(dest), { recursive: true });
          run("ditto", [join(mp, app), dest]);
          log(`   app ${gotVer} (${gotBuild}), key matches; copied to ${dest}`);
        } finally {
          if (run("hdiutil", ["detach", mp], { allowFail: true }).code !== 0) {
            await sleep(2000);
            run("hdiutil", ["detach", "-force", mp], { allowFail: true });
          }
          rmSync(mp, { recursive: true, force: true });
        }
        STATE.verifiedSha = sha;
      },
    },
    {
      name: `sign the DMG (sign_update --account ${ACCOUNT})`,
      desc: "sign_update, then verify the signature against the embedded public key",
      done: async () => (STATE.signature && STATE.length === statSync(STATE.dmg).size ? "already signed" : false),
      run: async () => {
        const out = run(join(sparkle(), "sign_update"), ["--account", ACCOUNT, STATE.dmg]).out;
        const sig = (out.match(/sparkle:edSignature="([^"]+)"/) || [])[1];
        if (!sig) throw new Error("sign_update printed no signature: " + out);
        const size = statSync(STATE.dmg).size;
        const declared = Number((out.match(/length="(\d+)"/) || [])[1] || size);
        if (declared !== size) throw new Error(`sign_update length ${declared} != file size ${size}`);
        if (!ed25519Verify(readFileSync(STATE.dmg), sig, plistFromText(plist, "SUPublicEDKey"))) throw new Error("Fresh signature does not verify against SUPublicEDKey.");
        STATE.signature = sig;
        STATE.length = size;
      },
    },
    {
      name: "GitHub prerelease with DMG, .sha256 and COMMUNITY-INSTALL.md",
      desc: "gh release create studio-vX-beta.N --prerelease (N auto-increments)",
      done: async () => {
        if (!STATE.tag) return false;
        const r = run("gh", ["release", "view", STATE.tag, "-R", REPO, "--json", "assets,publishedAt"], { allowFail: true });
        if (r.code !== 0) return false;
        const j = JSON.parse(r.out);
        const dmg = j.assets.find((a) => a.name.endsWith(".dmg"));
        if (!dmg || dmg.size !== STATE.length) return false;
        STATE.publishedAt = j.publishedAt;
        return `release ${STATE.tag} exists`;
      },
      run: async () => {
        const dmgName = STATE.dmg.split("/").pop();
        if (!STATE.tag) {
          const existing = ghJson(["release", "list", "-R", REPO, "--limit", "100", "--json", "tagName"]).map((r) => r.tagName);
          const re = new RegExp(`^studio-v${esc(version)}-beta\\.(\\d+)$`);
          const ns = existing.map((t) => (t.match(re) || [])[1]).filter(Boolean).map(Number);
          // adopt a half-finished release of ours (same DMG) instead of starting beta N+1
          for (const n of ns) {
            const a = ghJson(["release", "view", `studio-v${version}-beta.${n}`, "-R", REPO, "--json", "assets"]).assets.find((x) => x.name === dmgName);
            if (a && a.digest === `sha256:${sha256File(STATE.dmg)}`) STATE.tag = `studio-v${version}-beta.${n}`;
          }
          STATE.tag ||= `studio-v${version}-beta.${Math.max(0, ...ns) + 1}`;
          save();
        }
        const beta = STATE.tag.match(/beta\.(\d+)$/)[1];
        fetchMaster();
        const section = sectionBody(masterFile(STUDIO_CHANGELOG), new RegExp(`^## ${esc(version)} \\(build ${build}\\)`));
        if (!section) throw new Error(`apps/macos/CHANGELOG.md on master has no '## ${version} (build ${build})' section.`);
        const bullets = section.split("\n").filter((l) => !/^- \*\*Bundles RasanAI/i.test(l)).join("\n").trim();
        STATE.bullets = bullets;
        const first = (bullets.match(/^- \*\*(.+?)\*\*/m) || [])[1];
        const headline = STATE.title || (first ? first.replace(/[.:]$/, "") : "");
        const relTitle = `RasanAI Studio ${version} beta ${beta}${headline ? " — " + headline : ""}`;
        const notes = `${bullets}\n\n\nApple Silicon · macOS 14+ · community beta · ad-hoc signed, not Apple-notarized. Bundles RasanAI ${bundledSkill()}.\n`;
        const tmp = mkdtempSync(join(tmpdir(), "rasanai-notes-"));
        writeFileSync(join(tmp, "notes.md"), notes);
        writeFileSync(join(tmp, "COMMUNITY-INSTALL.md"), masterFile(INSTALL_DOC) + "\n");
        const files = [STATE.dmg, STATE.sha256File, join(tmp, "COMMUNITY-INSTALL.md")].filter(Boolean);
        const exists = run("gh", ["release", "view", STATE.tag, "-R", REPO], { allowFail: true }).code === 0;
        if (exists) {
          gh(["release", "upload", STATE.tag, "-R", REPO, "--clobber", ...files]);
        } else {
          gh(["release", "create", STATE.tag, "-R", REPO, "--prerelease", "--target", "master", "--title", relTitle, "--notes-file", join(tmp, "notes.md"), ...files]);
        }
        STATE.publishedAt = ghJson(["release", "view", STATE.tag, "-R", REPO, "--json", "publishedAt"]).publishedAt;
        log(`   https://github.com/${REPO}/releases/tag/${STATE.tag} (published ${STATE.publishedAt})`);
      },
    },
  );

  // Appcast: a second PR from fresh master
  const appcastHas = () => {
    fetchMaster();
    return parseItems(masterFile(APPCAST)).some((i) => i.version === String(build) && i.short === version);
  };
  steps.push(
    ...landSteps("appcast", {
      get branch() {
        const n = (STATE.tag || "").match(/beta\.(\d+)$/)?.[1];
        return n && n !== "1" ? `Sibhimanyu/appcast-${version}-beta.${n}` : `Sibhimanyu/appcast-${version}`;
      },
      get title() {
        return `Appcast: RasanAI Studio ${version} beta ${(STATE.tag || "").match(/beta\.(\d+)$/)?.[1] || 1} (build ${build})`;
      },
      body: `Adds RasanAI Studio ${version} (build ${build}) to the Sparkle appcast and points the site's download links at it. Merging deploys the feed through the site workflow.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
      get commitMsg() {
        return this.title;
      },
      landed: () => (appcastHas() ? "appcast on master already has this build" : false),
      landedSha: () => git(["log", "-1", "--format=%H", "origin/master", "--", APPCAST]),
      edit: (dir) => {
        const p = join(dir, APPCAST);
        const xml = readFileSync(p, "utf8");
        const prev = parseItems(xml)[0];
        if (!prev) throw new Error("appcast.xml has no previous item to copy minimumSystemVersion from.");
        const beta = STATE.tag.match(/beta\.(\d+)$/)[1];
        const pub = new Date(STATE.publishedAt).toUTCString();
        const item = [
          "    <item>",
          `      <title>RasanAI Studio ${version} beta ${beta}</title>`,
          `      <pubDate>${pub}</pubDate>`,
          `      <description sparkle:format="markdown"><![CDATA[${STATE.bullets}]]></description>`,
          `      <sparkle:version>${build}</sparkle:version>`,
          `      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>`,
          `      <sparkle:minimumSystemVersion>${prev.minOS}</sparkle:minimumSystemVersion>`,
          ...(prev.hw ? [`      <sparkle:hardwareRequirements>${prev.hw}</sparkle:hardwareRequirements>`] : []),
          `      <enclosure url="https://github.com/${REPO}/releases/download/${STATE.tag}/${STATE.dmg.split("/").pop()}" sparkle:edSignature="${STATE.signature}" length="${STATE.length}" type="application/octet-stream" />`,
          "    </item>",
        ].join("\n");
        const at = xml.indexOf("    <item>");
        if (at < 0) throw new Error("appcast.xml has no <item> to insert before.");
        writeFileSync(p, xml.slice(0, at) + item + "\n" + xml.slice(at));
        pointSiteAt(dir, STATE.tag, STATE.dmg.split("/").pop(), version, beta);
      },
    }),
    {
      name: "wait for the site workflow (deploys the feed)",
      desc: "find the site run for the appcast merge commit and wait for it to succeed",
      done: async () => (STATE.siteOk ? "site deploy already confirmed" : false),
      run: async () => {
        const sha = STATE.appcast?.mergeSha;
        const find = () =>
          (ghJson(["run", "list", "-R", REPO, "--workflow", "site.yml", "--branch", "master", "--limit", "20", "--json", "databaseId,headSha,status,conclusion,event"]) || []).find(
            (r) => r.event === "push" && (!sha || r.headSha === sha),
          );
        const r0 = await until("the site run for the appcast merge", find, { timeoutMs: 300000, everyMs: 8000 });
        log(`   site run ${r0.databaseId}: https://github.com/${REPO}/actions/runs/${r0.databaseId}`);
        const r = await until("the site run to finish", () => {
          const v = ghJson(["run", "view", String(r0.databaseId), "-R", REPO, "--json", "status,conclusion"]);
          return v.status === "completed" ? v : false;
        }, { timeoutMs: 900000, everyMs: 15000 });
        if (r.conclusion === "cancelled") log("   the run was superseded by a newer site deploy; the live feed decides");
        else if (r.conclusion !== "success") throw new Error(`site run ${r0.databaseId} ended ${r.conclusion}: https://github.com/${REPO}/actions/runs/${r0.databaseId}`);
        STATE.siteOk = true;
      },
    },
    {
      name: "poll the live feed",
      desc: `poll ${FEED_URL}?cb=... (up to ~15 min) until the top item is ${version} (${build})`,
      done: async () => {
        const top = (await liveFeed())[0];
        return top && top.short === version && top.version === String(build) ? `live feed top is ${top.short} (${top.version})` : false;
      },
      run: async () => {
        await until("the live feed to show the new version", async () => {
          const top = (await liveFeed())[0];
          log(`   live top: ${top?.short} (${top?.version})`);
          return top && top.short === version && top.version === String(build);
        }, { timeoutMs: 900000, everyMs: 20000 }).catch((e) => {
          throw new Error(`${e.message}. The site deploy may need a nudge: gh workflow run site.yml -R ${REPO} --ref master`);
        });
      },
    },
    deleteBranchStep(["bump", "appcast"]),
  );
  await runSteps(steps);
  const top = (await liveFeed().catch(() => []))[0];
  if (!DRY && top && top.short === version) log(`\nUsers will now be offered ${version}.`);
  else if (DRY) log(`\n[dry-run] done; nothing was changed.`);
}

// ---------- verify-studio ----------
function latestStudioRelease() {
  const rel = (ghJson(["release", "list", "-R", REPO, "--limit", "30", "--json", "tagName,publishedAt,isDraft,isPrerelease"]) || [])
    .filter((r) => r.tagName.startsWith("studio-v") && !r.isDraft)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  if (!rel) return null;
  const v = ghJson(["release", "view", rel.tagName, "-R", REPO, "--json", "assets,tagName,publishedAt"]);
  return { ...v, version: (rel.tagName.match(/^studio-v(\d+\.\d+\.\d+)/) || [])[1] };
}
async function verifyStudio() {
  fetchMaster();
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  };
  const feed = await liveFeed();
  const top = feed[0];
  const rel = latestStudioRelease();
  if (!top) return check("live feed has an item", false);
  if (!rel) return check("a studio GitHub release exists", false);
  check("live feed top item is the latest studio release", top.url?.includes(`/${rel.tagName}/`), `feed ${top.short} (${top.version}) at ${top.url?.split("/").slice(-2, -1)}, release ${rel.tagName}`);
  const dmgAsset = rel.assets.find((a) => a.name.endsWith(".dmg"));
  check("release carries a DMG", !!dmgAsset, dmgAsset?.name);
  check("enclosure length equals the release asset size", !!dmgAsset && dmgAsset.size === top.length, `${top.length} vs ${dmgAsset?.size}`);
  let bytes = null;
  try {
    const res = await fetch(top.url, { redirect: "follow" });
    check("enclosure URL resolves", res.ok, `HTTP ${res.status}`);
    if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    check("enclosure URL resolves", false, e.message);
  }
  if (bytes) {
    check("downloaded size equals length", bytes.length === top.length, `${bytes.length} vs ${top.length}`);
    const pub = plistFromText(masterFile(STUDIO_PLIST), "SUPublicEDKey");
    let ok = false;
    try {
      ok = ed25519Verify(bytes, top.sig, pub);
    } catch (e) {
      log(`   ${e.message}`);
    }
    check("edSignature verifies against SUPublicEDKey", ok);
  }
  const plistVer = plistFromText(masterFile(STUDIO_PLIST), "CFBundleShortVersionString");
  check("feed version is not behind master's Info.plist", cmpVer(top.short, plistVer) >= 0, `feed ${top.short}, master ${plistVer}`);
  log(results.every(Boolean) ? "\nAll checks passed." : "\nSome checks FAILED.");
  if (!results.every(Boolean)) process.exitCode = 1;
}

// ---------- status ----------
async function status() {
  fetchMaster();
  const lines = [];
  const flagLine = (ok, text) => lines.push(`${ok ? "ok  " : "WARN"}  ${text}`);
  // skill
  const ver = masterFile(SKILL_FILES.version).trim();
  const tags = git(["ls-remote", "--tags", "origin", "refs/tags/v*"]).split("\n").filter(Boolean).map((l) => l.split("refs/tags/")[1]).filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  tags.sort((a, b) => cmpVer(b.slice(1), a.slice(1)));
  const tag = tags[0];
  let ahead = "?";
  if (tag) ahead = gh(["api", `repos/${REPO}/compare/${tag}...master`, "--jq", ".ahead_by"]);
  lines.push("Skill");
  lines.push(`      master VERSION ${ver}; latest tag ${tag || "none"}; ${ahead} commit(s) on master since the tag`);
  flagLine(tag === `v${ver}`, tag === `v${ver}` ? `VERSION ${ver} is tagged` : `VERSION ${ver} is not the latest tag (${tag})`);
  const ghRel = ghJson(["release", "list", "-R", REPO, "--limit", "30", "--json", "tagName,isLatest"]) || [];
  const latest = ghRel.find((r) => r.isLatest);
  flagLine(!latest || latest.tagName === tag, `GitHub "Latest" release is ${latest?.tagName}`);
  for (const [k, f] of [["bridge", SKILL_FILES.bridge]]) flagLine(masterFile(f).trim() === ver, `${f} = ${masterFile(f).trim()}`);
  flagLine(JSON.parse(masterFile(SKILL_FILES.plugin)).version === ver, `plugin.json = ${JSON.parse(masterFile(SKILL_FILES.plugin)).version}`);
  const bridge = (JSON.parse(masterFile(SKILL_FILES.market)).plugins || []).find((p) => p.name === "rasa-director");
  flagLine(bridge?.version === ver, `marketplace rasa-director = ${bridge?.version}`);
  // studio
  lines.push("Studio");
  const rel = latestStudioRelease();
  const plist = masterFile(STUDIO_PLIST);
  const pv = plistFromText(plist, "CFBundleShortVersionString");
  const pb = plistFromText(plist, "CFBundleVersion");
  let feed = [];
  try {
    feed = await liveFeed();
  } catch (e) {
    flagLine(false, `live feed unreachable: ${e.message}`);
  }
  const top = feed[0];
  lines.push(`      latest release ${rel?.tagName || "none"}; Info.plist on master ${pv} (${pb}); live feed top ${top ? `${top.short} (${top.version})` : "none"}`);
  flagLine(!rel || cmpVer(pv, rel.version) <= 0, pv === rel?.version ? "Info.plist matches the latest release" : `Info.plist ${pv} vs release ${rel?.version}: ${cmpVer(pv, rel?.version || "0.0.0") > 0 ? "bumped but not released" : "behind"}`);
  const feedMatches = top && rel && top.url?.includes(`/${rel.tagName}/`);
  flagLine(!!feedMatches, feedMatches ? "live feed top item is the latest release" : `RELEASED BUT FEED NOT LIVE: feed top ${top?.short} does not match release ${rel?.tagName}`);
  if (rel && top) {
    const onMaster = parseItems(masterFile(APPCAST))[0];
    if (onMaster && top.short !== onMaster.short) flagLine(false, `appcast on master tops at ${onMaster.short} but the live feed shows ${top.short} (site deploy pending?)`);
  }
  log(lines.join("\n"));
}

// ---------- main ----------
const cmd = positional[0];
const usage = `Usage:
  node scripts/release.mjs skill <x.y.z> --title "<headline>" [--dry-run]
  node scripts/release.mjs studio <x.y.z> [--build N] [--title "<headline>"] [--dry-run]
  node scripts/release.mjs verify-studio
  node scripts/release.mjs status`;
try {
  if (DRY) log("[dry-run] read-only checks run; every change is only described.");
  if (cmd === "skill") await releaseSkill(positional[1]);
  else if (cmd === "studio") await releaseStudio(positional[1]);
  else if (cmd === "verify-studio") await verifyStudio();
  else if (cmd === "status") await status();
  else {
    log(usage);
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  console.error(`\nEverything done so far is recorded in .release-state/. Resume with exactly:\n  node scripts/release.mjs ${argv.join(" ")}`);
  process.exitCode = 1;
}
