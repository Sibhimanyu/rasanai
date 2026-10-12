#!/usr/bin/env node
// Research tools for the crew (agents/*.md): find the product on this computer, inventory an approved folder,
// and measure a reference film shot by shot.
//
//   node research.mjs local-find --name "<product>" [--domain example.com] [--roots "<dir>,<dir>"] [--max 12]
//        -> candidate project folders and earlier videos that look like this product. Reads only folder names,
//           package.json name/homepage, the git remote URL and the README's first heading: enough to ask the
//           user "can I read these?", nothing more. Never reads anything else.
//   node research.mjs local-inventory --dir <approved folder> --out <inventory.json>
//        -> what's where (READMEs, docs, DESIGN.md, design tokens, UI strings, changelogs, recent commit
//           subjects, logos, screenshots, fixtures, dev scripts, earlier videos) by path and size, not content
//   node research.mjs sources [--paths "<p1>,<p2>"] [--url <u>] [--code <dir>] [--kind <what the film is>] [--case <row>] [--public] --out <sources.json>
//        -> what the film is made FROM (references/sources.md): mode (web | local | footage | assets | document | existing-video | mixed), spine (which source the story is built from:
//           it decides the story pass and which gates apply), case, public, story_pass, product_first, each source with counts and hints, the chips the brief shows, the desks
//           crew.mjs plan --sources will staff. Reads names, sizes and ffprobe durations only, never content; only folders the user approved.
//   node research.mjs film (--url <video page> | --file <video>) --out <dir> [--keep] [--threshold 0.3]
//        -> <dir>/film.json (every cut, shot lengths, pacing stats, loudness) + <dir>/sheet.jpg (one frame per
//           shot). A downloaded film is for analysis only and is deleted afterwards unless --keep.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die, writeFile } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { classify, desksFor } from "./lib/sources.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { "local-find": `Looking for ${args.name || "the product"} on this computer (folder names only)`, "local-inventory": "Listing what's in the folder you approved", film: "Measuring a reference film shot by shot", sources: "Working out what your film is made from (names and sizes only)" }[cmd],
  { "local-find": "Local search done", "local-inventory": "Folder listed", film: "Film measured", sources: "Sources listed" }[cmd]
);
const out = (o, code = 0) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(code);
};
const home = os.homedir();
const tilde = (p) => (p.startsWith(home) ? "~" + p.slice(home.length) : p);
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "vendor", "target", "Library", "Applications", ".Trash", "Pictures", "Music", "Movies", "venv", ".venv", "__pycache__", ".cache", "coverage", "Pods", "DerivedData"]);
const readHead = (f, n = 4096) => {
  try {
    const fd = fs.openSync(f, "r");
    const b = Buffer.alloc(n);
    const len = fs.readSync(fd, b, 0, n, 0);
    fs.closeSync(fd);
    return b.slice(0, len).toString("utf8");
  } catch {
    return "";
  }
};

// ---------------------------------------------------------------- local-find
function projectMeta(dir) {
  const m = { dir, names: [path.basename(dir)] };
  const pkg = path.join(dir, "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const j = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (j.name) m.names.push(j.name);
      if (j.productName) m.names.push(j.productName);
      if (j.homepage) m.homepage = j.homepage;
    } catch {}
  }
  const gitCfg = path.join(dir, ".git", "config");
  if (fs.existsSync(gitCfg)) {
    const r = readHead(gitCfg, 8192).match(/url\s*=\s*(\S+)/);
    if (r) m.remote = r[1];
  }
  for (const f of ["README.md", "readme.md", "README"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      const h = readHead(p, 2048).match(/^#\s+(.+)$/m);
      if (h) m.title = h[1].trim().slice(0, 80);
      break;
    }
  }
  m.design_md = ["DESIGN.md", "design.md", "BRAND.md", "docs/DESIGN.md"].some((f) => fs.existsSync(path.join(dir, f)));
  return m;
}
const isProject = (d) => ["package.json", ".git", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "pubspec.yaml", "Package.swift", "hyperframes.json", "build.gradle", "pom.xml"].some((f) => fs.existsSync(path.join(d, f))) || fs.readdirSync(d).some((f) => f.endsWith(".xcodeproj"));

if (cmd === "local-find") {
  const name = args.name && args.name !== true ? String(args.name) : die("--name <product> required");
  const want = slug(name);
  if (want.length < 2) die("--name is too short to match on");
  const domain = args.domain && args.domain !== true ? String(args.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase() : null;
  const defaults = [process.cwd(), "code", "Code", "dev", "Developer", "Projects", "projects", "src", "repos", "work", "Work", "Documents/GitHub", "GitHub", "git", "conductor/repos", "Sites", "Desktop", "Documents"].map((r) => (path.isAbsolute(r) ? r : path.join(home, r)));
  const roots = (args.roots && args.roots !== true ? String(args.roots).split(",").map((s) => path.resolve(s.trim().replace(/^~(?=\/|$)/, home))) : defaults).filter((r) => fs.existsSync(r));
  const deadline = Date.now() + (Number(args.budget) || 8000);
  const seen = new Set();
  const found = [];
  const videos = [];
  const walk = (dir, depth, maxDepth = 4) => {
    if (Date.now() > deadline || depth > maxDepth) return;
    let real;
    try { real = fs.realpathSync(dir); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    // earlier videos: videos/<name>/hyperframes.json under any folder we pass
    if (path.basename(dir) === "videos") {
      for (const e of entries) if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, "hyperframes.json"))) {
        const s = slug(e.name);
        if (s.includes(want)) videos.push({ dir: tilde(path.join(dir, e.name)), renders: fs.existsSync(path.join(dir, e.name, "renders")) ? fs.readdirSync(path.join(dir, e.name, "renders")).filter((f) => f.endsWith(".mp4")) : [] });
      }
    }
    if (depth > 0) {
      let proj = false;
      try { proj = isProject(dir); } catch {}
      if (proj) {
        const m = projectMeta(dir);
        const why = [];
        if (m.names.some((n) => slug(n).includes(want))) why.push("name");
        if (m.title && slug(m.title).includes(want)) why.push("README title");
        if (m.remote && slug(m.remote).includes(want)) why.push("git remote");
        if (domain && ((m.homepage && m.homepage.toLowerCase().includes(domain)) || (m.remote && m.remote.toLowerCase().includes(domain.split(".")[0])))) why.push("domain");
        if (why.length) found.push({ dir: tilde(dir), why, title: m.title || null, remote: m.remote || null, design_md: m.design_md, score: why.length + (why.includes("name") ? 1 : 0) });
        if (depth >= 2) return; // don't descend into a project's own subfolders past one level
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".rasanai")) continue;
      walk(path.join(dir, e.name), depth + 1, maxDepth);
    }
  };
  for (const r of roots) walk(r, 0);
  // the home folder's own children, shallowly (a project or a videos/ folder kept straight under ~)
  if (!(args.roots && args.roots !== true)) walk(home, 0, 2);
  found.sort((a, b) => b.score - a.score);
  const max = Number(args.max) || 12;
  out({
    ok: true, name, roots: roots.map(tilde), timed_out: Date.now() > deadline || undefined,
    candidates: found.slice(0, max).map(({ score, ...x }) => x), earlier_videos: videos.slice(0, max),
    read: "folder names, package.json name/homepage, git remote URLs and README first headings only",
    next: found.length || videos.length ? "Ask the user in the console which of these you may read (and whether you may run the app), then crew.mjs plan --local <approved dirs>" : "Nothing local: research from the web only",
  });
}

// ---------------------------------------------------------------- local-inventory
else if (cmd === "local-inventory") {
  const dir = args.dir && args.dir !== true ? path.resolve(String(args.dir).replace(/^~(?=\/|$)/, home)) : die("--dir <approved folder> required");
  if (!fs.existsSync(dir)) die(`not found: ${dir}`);
  const outFile = args.out && args.out !== true ? path.resolve(String(args.out)) : die("--out <inventory.json> required");
  const K = { readme: [], docs: [], design: [], tokens: [], strings: [], changelog: [], logos: [], screenshots: [], fixtures: [], videos: [], secrets_skipped: 0 };
  const CAP = 40;
  const push = (k, p, st) => { if (K[k].length < CAP) K[k].push({ path: path.relative(dir, p), kb: Math.round(st.size / 1024) }); };
  const deadline = Date.now() + 8000;
  const walk = (d, depth) => {
    if (depth > 7 || Date.now() > deadline) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      const lower = e.name.toLowerCase();
      if (e.isDirectory()) {
        if (SKIP.has(e.name) || (e.name.startsWith(".") && ![".github", ".rasanai", ".storybook"].includes(e.name))) continue;
        if (e.name === "videos" && depth <= 2) for (const v of fs.readdirSync(p)) if (fs.existsSync(path.join(p, v, "hyperframes.json"))) K.videos.length < CAP && K.videos.push({ path: path.relative(dir, path.join(p, v)), storyboard: fs.existsSync(path.join(p, v, "STORYBOARD.md")), renders: fs.existsSync(path.join(p, v, "renders")) });
        walk(p, depth + 1);
        continue;
      }
      if (/^\.env|\.(pem|key|p12|keystore)$|secret|credential/i.test(e.name)) { K.secrets_skipped++; continue; }
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      const r = path.relative(dir, p).toLowerCase();
      if (/^readme(\.|$)/.test(lower)) push("readme", p, st);
      else if (/^(design|brand)\.md$/.test(lower) || /design-?system|brand-?guide/.test(r) && /\.(md|mdx)$/.test(lower)) push("design", p, st);
      else if (/^(changelog|changes|history|releases?)(\.|$)/.test(lower) || /release-?notes/.test(r)) push("changelog", p, st);
      else if (/^tailwind\.config\.|^theme\.(ts|js|json)$|tokens?\.(json|ts|js|css)$|variables\.(css|scss)$|^globals?\.css$|colors?\.(ts|js|json)$/.test(lower)) push("tokens", p, st);
      else if (/(locales?|i18n|lang|translations?|messages)\//.test(r) && /\.(json|ya?ml|po|strings|xliff|arb)$/.test(lower) || /^(en|en-us|en_us)\.(json|ya?ml)$/.test(lower) || lower === "localizable.strings") push("strings", p, st);
      else if (/\.(svg|png|ico|icns)$/.test(lower) && /(logo|brand|wordmark|icon|mark|favicon|app-?icon)/.test(lower)) push("logos", p, st);
      else if (/\.(png|jpe?g|webp|gif)$/.test(lower) && /(screenshot|screen|hero|preview|demo|og[-_]?image|social)/.test(r)) push("screenshots", p, st);
      else if (/(fixtures?|seeds?|mocks?|sample-?data|demo-?data)\//.test(r) && /\.(json|ya?ml|csv|sql)$/.test(lower)) push("fixtures", p, st);
      else if (/^docs?\//.test(r) && /\.(md|mdx)$/.test(lower)) push("docs", p, st);
    }
  };
  walk(dir, 0);
  let scripts = null, framework = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    scripts = Object.fromEntries(Object.entries(j.scripts || {}).filter(([k]) => /^(dev|start|serve|preview|storybook)$/.test(k)));
    const deps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
    framework = ["next", "nuxt", "@sveltejs/kit", "astro", "vite", "react-scripts", "@remix-run/react", "expo", "electron", "@angular/core", "vue"].find((d) => deps[d]) || null;
  } catch {}
  let commits = [];
  if (fs.existsSync(path.join(dir, ".git"))) {
    const r = spawnSync("git", ["-C", dir, "log", "-n", "60", "--date=short", "--pretty=%ad %s"], { encoding: "utf8" });
    if (r.status === 0) commits = r.stdout.trim().split("\n").filter(Boolean);
  }
  const inv = { dir: tilde(dir), framework, dev_scripts: scripts, recent_commits: commits, ...K, timed_out: Date.now() > deadline || undefined };
  writeFile(outFile, JSON.stringify(inv, null, 2));
  out({ ok: true, out: path.relative(process.cwd(), outFile), counts: Object.fromEntries(Object.entries(K).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])), commits: commits.length, framework, dev_scripts: scripts });
}

// ---------------------------------------------------------------- sources
else if (cmd === "sources") {
  const paths = args.paths && args.paths !== true ? String(args.paths).split(",").map((x) => x.trim()).filter(Boolean) : [];
  const url = args.url && args.url !== true ? String(args.url) : null;
  const code = args.code && args.code !== true ? String(args.code).split(",").map((x) => x.trim()).filter(Boolean) : [];
  if (!paths.length && !url && !code.length) die("sources needs --paths <folders or files>, --url <site> or --code <dir>");
  const outFile = args.out && args.out !== true ? path.resolve(String(args.out)) : die("--out <sources.json> required");
  const src = classify(paths, { url, code, kind: args.kind && args.kind !== true ? String(args.kind) : "", case: args.case && args.case !== true ? String(args.case) : "", public: !!args.public });
  src.desks = desksFor(src);
  writeFile(outFile, JSON.stringify(src, null, 2));
  out({ ok: true, out: path.relative(process.cwd(), outFile), mode: src.mode, spine: src.spine, case: src.case, public: src.public, story_pass: src.story_pass, product_first: src.product_first, chips: src.chips, desks: src.desks.map((d) => `${d.desk}: ${d.roles.join(", ")}`), notes: src.notes, next: src.spine === "footage" || src.spine === "existing-video" ? "Footage spine: footage.mjs ingest|shots|transcribe, then crew.mjs plan --sources " + path.relative(process.cwd(), outFile) : "crew.mjs plan --sources " + path.relative(process.cwd(), outFile) });
}

// ---------------------------------------------------------------- film
else if (cmd === "film") {
  const outDir = args.out && args.out !== true ? path.resolve(String(args.out)) : die("--out <dir> required");
  fs.mkdirSync(outDir, { recursive: true });
  const has = (b) => spawnSync(b, ["--version"], { encoding: "utf8" }).status === 0 || spawnSync(b, ["-version"], { encoding: "utf8" }).status === 0;
  if (!has("ffmpeg")) die("ffmpeg is required (brew install ffmpeg / apt install ffmpeg)");
  let file, title = null, source;
  let downloaded = false;
  if (args.url && args.url !== true) {
    source = String(args.url);
    if (!has("yt-dlp")) die("yt-dlp is needed to fetch a film from a URL (brew install yt-dlp / pipx install yt-dlp); or pass --file");
    const tmpl = path.join(outDir, "film.%(ext)s");
    const r = spawnSync("yt-dlp", ["-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4", "--no-playlist", "--max-filesize", "400M", "-o", tmpl, "--print", "after_move:filepath", "--print", "title", "--no-simulate", "--quiet", "--no-warnings", source], { encoding: "utf8", timeout: 600000 });
    if (r.status !== 0) die(`yt-dlp could not fetch it: ${(r.stderr || "").trim().split("\n").pop() || "unknown error"}`);
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    title = lines.find((l) => !fs.existsSync(l)) || null;
    file = lines.reverse().find((l) => fs.existsSync(l));
    if (!file) die("yt-dlp finished but no file was written");
    downloaded = true;
  } else if (args.file && args.file !== true) {
    file = path.resolve(String(args.file));
    source = file;
    if (!fs.existsSync(file)) die(`not found: ${file}`);
  } else die("--url <video page> or --file <video> required");
  const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate,codec_type", "-of", "json", file], { encoding: "utf8" });
  let D = 0, W = 0, H = 0, fps = 30;
  try {
    const j = JSON.parse(pr.stdout);
    D = Number(j.format.duration);
    const v = j.streams.find((s) => s.codec_type === "video");
    W = v.width; H = v.height;
    const [a, b] = String(v.r_frame_rate || "30/1").split("/").map(Number);
    fps = b ? a / b : 30;
  } catch {
    die("ffprobe could not read the film");
  }
  // scene detection: start at the usual threshold and step down when a film with soft cuts (similar frames,
  // dissolves) reads as almost one shot; the threshold used is reported
  const detect = (thr) => {
    const sc = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", `scale=320:-2,select='gt(scene,${thr})',showinfo`, "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return [...String(sc.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.08 && t < D - 0.08);
  };
  let thr = Number(args.threshold) || 0.3;
  let cuts = detect(thr);
  if (!args.threshold) for (const lower of [0.15, 0.06, 0.03]) {
    if (cuts.length >= D / 12) break;
    thr = lower;
    cuts = detect(thr);
  }
  // a cut closer than 2 frames to the previous one is a flash or a dissolve's second detection: merge
  const merged = [];
  for (const c of cuts) if (!merged.length || c - merged[merged.length - 1] > 2 / fps) merged.push(c);
  const bounds = [0, ...merged, D];
  const shots = bounds.slice(1).map((e, i) => ({ n: i + 1, start: +bounds[i].toFixed(3), end: +e.toFixed(3), len: +(e - bounds[i]).toFixed(3) }));
  const lens = shots.map((s) => s.len);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  const sorted = [...lens].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const longest = shots.reduce((a, b) => (b.len > a.len ? b : a));
  // one frame from the middle of each shot (at most 48, evenly sampled), tiled into a sheet
  const pick = shots.length <= 48 ? shots : Array.from({ length: 48 }, (_, i) => shots[Math.floor((i * shots.length) / 48)]);
  const fdir = path.join(outDir, "frames");
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });
  pick.forEach((s, i) => {
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(s.start + s.len / 2), "-i", file, "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black", "-q:v", "4", path.join(fdir, `${String(i + 1).padStart(3, "0")}.jpg`)]);
  });
  const cols = 8;
  const rows = Math.ceil(pick.length / cols);
  const sheet = path.join(outDir, "sheet.jpg");
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(fdir, "%03d.jpg"), "-vf", `tile=${cols}x${rows}:padding=4:color=black`, "-frames:v", "1", "-q:v", "3", sheet]);
  const lo = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const I = (String(lo.stderr).match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop();
  const film = {
    source, title, duration_s: +D.toFixed(2), width: W, height: H, fps: +fps.toFixed(2),
    shots, stats: { count: shots.length, mean_s: +mean.toFixed(2), median_s: +median.toFixed(2), min_s: sorted[0], max_s: sorted[sorted.length - 1], cv: +(sd / mean).toFixed(2), cuts_per_min: +((merged.length / D) * 60).toFixed(1), longest },
    threshold: thr,
    loudness_lufs: I ? Number(I.match(/-?[\d.]+/)[0]) : null,
    sheet: path.relative(process.cwd(), sheet), sheet_shots: pick.map((s) => s.n),
    note: "Scene detection finds hard cuts and most wipes; dissolves and morphs can read as one shot. Look at the sheet.",
    deleted: downloaded && !args.keep,
  };
  if (downloaded && !args.keep) fs.rmSync(file, { force: true });
  writeFile(path.join(outDir, "film.json"), JSON.stringify(film, null, 2));
  out({ ok: true, film: path.relative(process.cwd(), path.join(outDir, "film.json")), title, ...film.stats, threshold: thr, sheet: film.sheet });
} else {
  die("usage: research.mjs local-find|local-inventory|sources|film … (see the header)");
}
