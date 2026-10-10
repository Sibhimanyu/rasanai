#!/usr/bin/env node
// Entire videos: sets up and hands a multi-scene HyperFrames workflow everything
// the director decided, at the exact hook points the workflow reads
// (integration map: references/video.md).
//
//   node video.mjs init    --route <route> --project <kebab-name> [--aspect 16:9] [--workspace .] [--project-dir <dir>]
//   node video.mjs capture --project-dir <dir> (--url <https://...> | --no-capture --title "..." --text-file <brief.txt>)
//   node video.mjs write   --project-dir <dir> --decisions <video-decisions.json> [--revise]
//   node video.mjs inject  --project-dir <dir> [--runtime]  (after the workflow's frame-packets.mjs, before dispatching frame workers)
//   node video.mjs audio-lock --project-dir <dir> --music <file>   (after audio.mjs fetch-sfx, before assemble-index)
//   node video.mjs carriers --project-dir <dir>   (after assemble-index: mounts compositions/carriers/*.html, the objects
//        that cross a cut, as their own tracks in index.html; idempotent)
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, readJSON, writeFile, normalizeAspect, readFrontmatterDoc } from "./lib/common.mjs";
import { resolvePreset, findSkill } from "./lib/hyperframes.mjs";
import { contractText, upsertContract, motionLabel } from "./lib/contract.mjs";
import { installLook, installDirection, directionSection, upsertMarked, DIRECTION_MARK } from "./lib/install.mjs";
import { readDesignMd, toTokensJson } from "./lib/design-md.mjs";
import { track } from "./lib/report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
track(
  { capture: args.url ? `Capturing ${String(args.url).replace(/^https?:\/\//, "")}: screenshots, copy and assets` : "Reading your brief", write: "Writing the plan into the project", inject: "Handing each scene its brief and motion rules", init: "Setting up the video project" }[cmd],
  { capture: "Capture done", write: "Plan written: brief, storyboard, design system, motion rules", inject: "Every scene has its brief", init: "Project ready" }[cmd]
);
const STORY_ROUTES = ["product-launch-video", "faceless-explainer", "pr-to-video", "general-video"];
const ALL_ROUTES = [...STORY_ROUTES, "music-to-video", "talking-head-recut", "embedded-captions"];
const RESOLUTION = { "1920x1080": "landscape", "1080x1920": "portrait", "1080x1080": "square" };
const q = (s) => JSON.stringify(String(s));
const run = (bin, argv, opts = {}) => execFileSync(bin, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const projectDir = () => {
  if (!args["project-dir"]) die("--project-dir <videos/name> is required");
  const d = path.resolve(String(args["project-dir"]));
  return d;
};

if (cmd === "init") {
  const route = String(args.route || "");
  if (!ALL_ROUTES.includes(route)) die(`--route must be one of ${ALL_ROUTES.join(", ")}`);
  if (!args["project-dir"] && !/^[a-z0-9][a-z0-9-]*$/.test(String(args.project || ""))) die("--project <kebab-name> (or --project-dir) is required");
  const ws = path.resolve(String(args.workspace || "."));
  const dir = args["project-dir"] ? path.resolve(String(args["project-dir"])) : path.join(ws, "videos", String(args.project));
  if (dir === ws) die("never init the workspace root; use videos/<name>");
  const aspect = normalizeAspect(args.aspect || "16:9");
  let initialized = false;
  // footage workflows manage their own folder (talking-head-recut: no init; embedded-captions: init with --video)
  if (["talking-head-recut", "embedded-captions"].includes(route)) fs.mkdirSync(dir, { recursive: true });
  else if (!fs.existsSync(path.join(dir, "hyperframes.json"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try {
      run("npx", ["--yes", "hyperframes", "init", dir, "--non-interactive", "--example=blank", `--skill=${route}`, ...(RESOLUTION[aspect] ? [`--resolution=${RESOLUTION[aspect]}`] : [])], { cwd: ws });
    } catch (e) {
      if (!fs.existsSync(path.join(dir, "hyperframes.json"))) die(`hyperframes init failed:\n${e.stderr || e.message}`);
    }
    initialized = true;
  }
  console.log(JSON.stringify({ ok: true, route, project_dir: dir, aspect, initialized }, null, 2));
} else if (cmd === "capture") {
  const dir = projectDir();
  const cap = path.join(dir, "capture");
  const need = ["extracted/tokens.json", "extracted/visible-text.txt", "extracted/asset-descriptions.md", "assets"];
  if (args.url) {
    let res;
    try {
      res = run("npx", ["--yes", "hyperframes", "capture", String(args.url), "-o", cap, "--json"], { cwd: dir, timeout: 600000 });
    } catch (e) {
      die(`capture failed (hard stop: do not build from a partial capture):\n${String(e.stdout || "") + String(e.stderr || e.message)}`.slice(0, 4000));
    }
    let j = {};
    try {
      j = JSON.parse(res.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop() || "{}");
    } catch {}
    if (j.ok === false || fs.existsSync(path.join(cap, "BLOCKED.md"))) die(`capture was blocked: ${fs.existsSync(path.join(cap, "BLOCKED.md")) ? fs.readFileSync(path.join(cap, "BLOCKED.md"), "utf8").slice(0, 600) : JSON.stringify(j).slice(0, 600)}\nHard stop: ask for screenshots or a brief instead.`);
  } else if (args["no-capture"]) {
    // the workflow's documented no-capture path
    const text = args["text-file"] ? fs.readFileSync(path.resolve(String(args["text-file"])), "utf8") : String(args.text || "");
    writeFile(path.join(cap, "extracted", "tokens.json"), JSON.stringify({ title: String(args.title || ""), description: text.split("\n")[0].slice(0, 200), colors: [], fonts: [] }, null, 2) + "\n");
    writeFile(path.join(cap, "extracted", "visible-text.txt"), text + "\n");
    writeFile(path.join(cap, "extracted", "asset-descriptions.md"), "# Assets\n\nNo assets were captured (no site). Pure typography and invented visuals.\n");
    fs.mkdirSync(path.join(cap, "assets"), { recursive: true });
  } else die("capture needs --url <site> or --no-capture (with --title and --text-file/--text)");
  const missing = need.filter((n) => !fs.existsSync(path.join(cap, n)));
  if (missing.length) die(`capture incomplete (missing ${missing.join(", ")}); hard stop`);
  const tokens = readJSON(path.join(cap, "extracted", "tokens.json"));
  const shots = fs.existsSync(path.join(cap, "screenshots")) ? fs.readdirSync(path.join(cap, "screenshots")).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => path.join(cap, "screenshots", f)) : [];
  console.log(JSON.stringify({ ok: true, capture: cap, title: tokens.title || "", colors: (tokens.colors || []).length, fonts: tokens.fonts || [], screenshots: shots.slice(0, 8).map((s) => path.relative(process.cwd(), s)) }, null, 2));
} else if (cmd === "write") {
  await write();
} else if (cmd === "inject") {
  const dir = projectDir();
  const M = readFrontmatterDoc(fs.readFileSync(path.join(dir, "motion.md"), "utf8")).fields;
  const pk = path.join(dir, ".hyperframes", "frame-packets");
  if (!fs.existsSync(pk)) die(`no ${path.relative(process.cwd(), pk)}: run the workflow's frame-packets.mjs first`);
  const section = contractText(M, { video: true });
  // the art direction travels with the contract when the project has one (direction.json from write)
  const dj = path.join(dir, "direction.json");
  const dirSection = fs.existsSync(dj) ? directionSection(readJSON(dj)) : null;
  const done = [];
  for (const f of fs.readdirSync(pk).filter((x) => x.endsWith(".md") && !x.startsWith("_"))) {
    const p = path.join(pk, f);
    let next = upsertContract(fs.readFileSync(p, "utf8"), section);
    if (dirSection) next = upsertMarked(next, DIRECTION_MARK, dirSection);
    if (Buffer.byteLength(next) > 48000) die(`${f} would exceed the workflow's 48,000-byte packet cap with the contract${dirSection ? " and direction" : ""} appended; trim that frame's block`);
    fs.writeFileSync(p, next);
    done.push(f);
  }
  if (!done.length) die("no frame packets found to inject");
  // scenes the score puts in 3D get the Rasan3D runtime in the project (assets/three/)
  const sb = fs.existsSync(path.join(dir, "STORYBOARD.md")) ? fs.readFileSync(path.join(dir, "STORYBOARD.md"), "utf8") : "";
  let three = null;
  if (args.runtime || /^- space: (3d|hybrid)\b/m.test(sb)) {
    const { install } = await import("./lib/stage3d.mjs");
    three = install(dir);
  }
  console.log(JSON.stringify({ ok: true, injected: done, direction: !!dirSection, ...(three ? { three: { runtime: path.relative(process.cwd(), three.dir), script: three.script } } : {}) }, null, 2));
} else if (cmd === "audio-lock") {
  const dir = projectDir();
  if (!args.music) die("--music <file> required");
  const src = path.resolve(String(args.music));
  if (!fs.existsSync(src)) die(`music file not found: ${args.music}`);
  const rel = path.join("assets", `music-bed${path.extname(src) || ".wav"}`);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  if (path.resolve(dir, rel) !== src) fs.copyFileSync(src, path.join(dir, rel));
  let dur = null;
  try {
    dur = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path.join(dir, rel)]).trim()) || null;
  } catch {}
  // a bed mastered by sound.mjs render (about -14 LUFS) sits 12 LU under a -16 LUFS voice at 0.2; a raw track needs less
  let lufs = null;
  try {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", path.join(dir, rel), "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
    lufs = Number(((r.stderr || "").match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0]);
  } catch {}
  const mastered = args.mastered != null ? args.mastered !== "false" : Number.isFinite(lufs) && lufs > -16.5 && lufs < -11.5;
  const patch = (file) => {
    const p = path.join(dir, file);
    const meta = fs.existsSync(p) ? readJSON(p) : {};
    const voiced = Array.isArray(meta.voices) && meta.voices.length > 0;
    meta.bgm = { ...(meta.bgm || {}), path: rel.split(path.sep).join("/"), volume: mastered ? (voiced ? 0.2 : 1.0) : voiced ? 0.12 : 0.9, query: "locked by RasanAI", duration_s: dur };
    delete meta.bgm_pending;
    fs.writeFileSync(p, JSON.stringify(meta, null, 2) + "\n");
    return file;
  };
  const patched = [patch("audio_meta.json")];
  if (fs.existsSync(path.join(dir, "audio_engine_meta.json"))) patched.push(patch("audio_engine_meta.json"));
  console.log(JSON.stringify({ ok: true, music: rel, duration_s: dur, lufs: Number.isFinite(lufs) ? lufs : null, mastered, patched }, null, 2));
} else if (cmd === "carriers") {
  // mount every carrier (an object that crosses a cut: compositions/carriers/<name>.html, root timed by its own
  // data-start / data-duration in film seconds) as its own track in index.html, so it is one object on one tween
  // across the beats. Idempotent: the block between the markers is replaced each run.
  const dir = projectDir();
  const idx = path.join(dir, "index.html");
  if (!fs.existsSync(idx)) die("no index.html: run the workflow's assemble-index.mjs first");
  const cdir = path.join(dir, "compositions", "carriers");
  const files = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter((f) => f.endsWith(".html")).sort() : [];
  const hosts = [];
  files.forEach((f, i) => {
    const html = fs.readFileSync(path.join(cdir, f), "utf8");
    const id = (html.match(/data-composition-id="([^"]+)"/) || [])[1] || `carrier-${path.basename(f, ".html")}`;
    const start = Number((html.match(/data-start="([\d.]+)"/) || [])[1]);
    const dur = Number((html.match(/data-duration="([\d.]+)"/) || [])[1]);
    if (!(dur > 0) || !Number.isFinite(start)) die(`${f}: its root needs data-start and data-duration in film seconds (the span of the beats it crosses)`);
    hosts.push(`<div class="clip" data-composition-id="${id}" data-composition-src="compositions/carriers/${f}" data-start="${start}" data-duration="${dur}" data-track-index="${3 + i}"></div>`);
  });
  const M0 = "<!-- rasanai:carriers -->", M1 = "<!-- /rasanai:carriers -->";
  let t = fs.readFileSync(idx, "utf8").replace(new RegExp(`[ \\t]*${M0}[\\s\\S]*?${M1}\\n?`, "g"), "");
  if (hosts.length) {
    // inside #root, after its last child: find the root's matching close by div depth
    const open = t.search(/<div[^>]*\bid="root"[^>]*>/);
    if (open < 0) die('index.html has no <div id="root">');
    const re = /<\/?div\b[^>]*>/g;
    re.lastIndex = open;
    let depth = 0, close = -1, m;
    while ((m = re.exec(t))) { depth += m[0][1] === "/" ? -1 : 1; if (depth === 0) { close = m.index; break; } }
    if (close < 0) die("could not find where #root closes in index.html");
    t = t.slice(0, close) + `  ${M0}\n    ${hosts.join("\n    ")}\n  ${M1}\n` + t.slice(close);
  }
  fs.writeFileSync(idx, t);
  console.log(JSON.stringify({ ok: true, carriers: files, tracks: hosts.length ? `3-${2 + hosts.length}` : null }, null, 2));
} else {
  die("usage: video.mjs init|capture|write|inject|audio-lock|carriers ... (see the header)");
}

async function write() {
  const dir = projectDir();
  if (!args.decisions) die("--decisions <video-decisions.json> required");
  const decPath = path.resolve(String(args.decisions));
  const D = readJSON(decPath);
  const base = path.dirname(decPath);
  const rel = (p) => (p && !path.isAbsolute(p) ? [path.resolve(process.cwd(), p), path.resolve(base, p)].find((c) => fs.existsSync(c)) || path.resolve(process.cwd(), p) : p);
  const route = String(D.route || "");
  if (!ALL_ROUTES.includes(route)) die(`decisions.route must be one of ${ALL_ROUTES.join(", ")}`);
  if (!D.message) die("decisions.message is required");
  const story = STORY_ROUTES.includes(route);
  const footage = ["talking-head-recut", "embedded-captions"].includes(route);
  if (!footage && !fs.existsSync(path.join(dir, "hyperframes.json"))) die(`${dir} is not an initialized project: run \`video.mjs init\` first`);
  const aspect = normalizeAspect(D.aspect || "16:9");
  const [W, H] = aspect.split("x").map(Number);

  // ---- check every input before writing anything
  const motionSrc = D.motion && rel(D.motion);
  if (!footage && (!motionSrc || !fs.existsSync(motionSrc))) die(`motion.md not found: ${D.motion}`);
  const sbDir = D.storyboard_dir && rel(D.storyboard_dir);
  if (story && (!sbDir || !fs.existsSync(path.join(sbDir, "STORYBOARD.md")))) die("decisions.storyboard_dir must hold the STORYBOARD.md written by scenes.mjs");
  const timeline = story ? readJSON(path.join(sbDir, "timeline.json")) : null;
  if (timeline && normalizeAspect(timeline.aspect) !== aspect) die(`the scenes were planned at ${timeline.aspect} but decisions.aspect is ${aspect}`);
  let preset = D.look && D.look.preset;
  if (route === "pr-to-video") preset = "code-editorial"; // fixed by the workflow
  const frameSrc = D.look && D.look.frame && rel(D.look.frame);
  if (preset) resolvePreset(preset);
  if (frameSrc && !fs.existsSync(frameSrc)) die(`frame spec not found: ${D.look.frame}`);
  // a picked design direction (look.frame) wins over the raw brand reference; the brand's don'ts still reach DIRECTION.md via decisions.brand
  const designMd = D.look && D.look.design_md && !D.look.frame && rel(D.look.design_md);
  if (route === "music-to-video" && D.look && (D.look.frame || D.look.design_md) && !preset) die("music-to-video needs a frame preset (its gate requires frame.md to be a verbatim preset copy): choose one with pick.mjs look");
  if (designMd && !fs.existsSync(designMd)) die(`brand reference not found: ${D.look.design_md}`);
  const directionSrc = D.direction && rel(D.direction);
  if (directionSrc && !fs.existsSync(directionSrc)) die(`direction not found: ${D.direction} (compile it with direction.mjs compile)`);
  const musicSrc = D.music && D.music.path && rel(D.music.path);
  if (musicSrc && !fs.existsSync(musicSrc)) die(`music track not found: ${D.music.path}`);
  const lengthS = timeline ? timeline.total_s : Number(D.length_s) || null;
  // --revise: a video that was already built gets its build artifacts moved aside, so the
  // workflow's resume logic rebuilds from the new plan instead of reusing stale frames/audio
  const moved = [];
  if (args.revise) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const t of ["compositions", "snapshots", "renders", "index.html", "audio_meta.json", "audio_engine_meta.json", "audio_request.json", ".hyperframes/frame-packets", "storyboard.html"]) {
      const p = path.join(dir, t);
      if (!fs.existsSync(p)) continue;
      const dest = path.join(dir, ".superseded", stamp, t);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(p, dest);
      moved.push(t);
    }
  } else if (fs.existsSync(path.join(dir, "compositions", "frames")) && fs.readdirSync(path.join(dir, "compositions", "frames")).length) {
    die(`${dir} already has built frames. Re-run with --revise to move the build aside and rebuild from the new plan.`);
  }
  const M = motionSrc ? readFrontmatterDoc(fs.readFileSync(motionSrc, "utf8")).fields : null;
  const feel = motionSrc ? (readFrontmatterDoc(fs.readFileSync(motionSrc, "utf8")).body.split("## How it moves")[1] || "").split("\n## ")[0].trim() : "";
  const wrote = [];
  const put = (name, content) => {
    writeFile(path.join(dir, name), content);
    wrote.push(name);
  };

  // ---- frame.md (the one file every frame worker reads) + the motion contract in it
  const workflowDir = findSkill(route);
  let stepTwo = "";
  const lookNotes = [];
  if (!footage) {
    if (preset && designMd && route !== "music-to-video") {
      // the brand reference remixed onto a preset's layout: build-frame reads capture/extracted/tokens.json
      writeFile(path.join(dir, "capture", "extracted", "tokens.json"), JSON.stringify(toTokensJson(readDesignMd(designMd, { mode: D.look.mode })), null, 2) + "\n");
    }
    if (preset && route !== "music-to-video") {
      const bf = ["product-launch-video", "faceless-explainer", "pr-to-video"].map((r) => findSkill(r) && path.join(findSkill(r), "scripts", "build-frame.mjs")).find((p) => p && fs.existsSync(p));
      if (!bf) die("build-frame.mjs not found (install a HyperFrames launch/explainer workflow)");
      try {
        run("node", [bf, "--preset", preset, "--hyperframes", dir], { cwd: dir });
      } catch (e) {
        die(`build-frame.mjs failed:\n${e.stderr || e.message}`);
      }
      wrote.push("frame.md", ".hyperframes/caption-skin.html");
      stepTwo = `Step 2 (design system) is done: frame.md was built from the \`${preset}\` preset${fs.existsSync(path.join(dir, "capture", "extracted", "tokens.json")) ? " and remixed onto the captured brand tokens" : ""} by running build-frame.mjs. Do not run build-frame.mjs again (it would drop the motion contract appended to frame.md).`;
    } else if (preset && route === "music-to-video") {
      put("frame.md", fs.readFileSync(resolvePreset(preset), "utf8"));
      stepTwo = `The brand step's preset copy is done: frame.md is the \`${preset}\` preset.`;
    } else if (designMd) {
      const r = await installLook(dir, { designMd, mode: D.look.mode });
      wrote.push("frame.md", "capture/extracted/tokens.json");
      lookNotes.push(...r.notes);
      stepTwo = `The design system is the project's own brand reference (${path.basename(designMd)}), converted to frame.md with its fonts staged in assets/fonts/ (see frame.md "Font loading"). Do not replace it with a preset and do not run build-frame.mjs.`;
    } else if (frameSrc) {
      const r = await installLook(dir, { frame: frameSrc });
      wrote.push("frame.md");
      lookNotes.push(...r.notes);
      stepTwo = `The design system is decided (${D.look.name || "the chosen design direction"}), written to frame.md with its fonts staged in assets/fonts/ (see frame.md "Font loading"). Do not replace it with a preset and do not run build-frame.mjs.`;
    }
    if (M && fs.existsSync(path.join(dir, "frame.md"))) {
      const contract = contractText(M, { lengthS, W, H, video: true, feel });
      if (route === "music-to-video") {
        // M2V's gate wants frame.md to stay a verbatim preset copy: the contract goes in motion.md + DISPATCH instead
      } else fs.writeFileSync(path.join(dir, "frame.md"), upsertContract(fs.readFileSync(path.join(dir, "frame.md"), "utf8"), contract));
    }
    if (motionSrc) put("motion.md", fs.readFileSync(motionSrc, "utf8"));
  }
  // ---- the art direction (DIRECTION.md) + its binding summary in frame.md
  let dirInstalled = null;
  if (directionSrc && !footage) {
    dirInstalled = installDirection(dir, directionSrc);
    wrote.push("DIRECTION.md", "direction.json");
    if (route !== "music-to-video" && fs.existsSync(path.join(dir, "frame.md"))) fs.writeFileSync(path.join(dir, "frame.md"), upsertMarked(fs.readFileSync(path.join(dir, "frame.md"), "utf8"), DIRECTION_MARK, dirInstalled.section));
  }

  // ---- the approved plan
  if (story) {
    put("STORYBOARD.md", fs.readFileSync(path.join(sbDir, "STORYBOARD.md"), "utf8"));
    if (fs.existsSync(path.join(sbDir, "SCRIPT.md"))) put("SCRIPT.md", fs.readFileSync(path.join(sbDir, "SCRIPT.md"), "utf8"));
    else if (fs.existsSync(path.join(dir, "SCRIPT.md"))) fs.rmSync(path.join(dir, "SCRIPT.md"));
  }
  let musicRel = null;
  if (musicSrc) {
    musicRel = route === "music-to-video" ? "assets/bgm.mp3" : `assets/music-bed${path.extname(musicSrc) || ".wav"}`;
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    if (route === "music-to-video" && !/\.mp3$/i.test(musicSrc)) {
      try {
        run("ffmpeg", ["-y", "-loglevel", "error", "-i", musicSrc, "-codec:a", "libmp3lame", "-q:a", "2", path.join(dir, musicRel)]);
      } catch (e) {
        die(`could not convert the track to assets/bgm.mp3 (ffmpeg): ${e.stderr || e.message}`);
      }
    } else fs.copyFileSync(musicSrc, path.join(dir, musicRel));
    wrote.push(musicRel);
  }

  // ---- BRIEF.md: canonical frontmatter + the director's instructions to the workflow
  const autonomous = D.mode === "autonomous";
  const rasa = path.resolve(HERE);
  const fmLines = [
    `workflow: ${route}`,
    "flow: automation",
    `storyboard: ${autonomous ? "no" : "yes"}`,
    `message: ${q(D.message)}`,
    D.destination ? `destination: ${D.destination}` : null,
    `aspect: ${aspect}`,
    `language: ${D.language || "en"}`,
    lengthS ? `length: ${lengthS}s` : null,
    D.audience ? `audience: ${q(D.audience)}` : null,
    D.angle ? `angle: ${D.angle}` : null,
    preset ? `style_preset: ${preset}` : null,
    D.voice && D.voice.id ? `voice: ${D.voice.id}` : null,
  ].filter(Boolean);
  const custom = [];
  if (stepTwo) custom.push(stepTwo);
  if (story) {
    custom.push(`**The plan is approved.** STORYBOARD.md${fs.existsSync(path.join(dir, "SCRIPT.md")) ? " and SCRIPT.md were" : " was"} written with the user frame by frame in RasanAI (scene list, on-screen text, voiceover, durations, \`transition_in\`, per-frame \`motion_intensity\`). Adopt them as the approved plan: do not rewrite beats, lines or transitions; the plan gate is satisfied. Continue with the workflow's audio step and its visual-design step${autonomous ? "" : " (its sketch pass and layout gate still run)"}.`);
    if (route === "general-video") custom.push("Frame `src` paths are `compositions/frames/NN-*.html`; write frames there.");
  }
  if (D.voice && D.voice.id) custom.push(`**Voice:** narrate with ${D.voice.name || "the chosen voice"} — pass \`--voice ${D.voice.id}\`${route === "product-launch-video" ? ` --provider ${D.voice.provider || "heygen"}` : ""} to the audio step (the SCRIPT.md \`**Voice:**\` header is not parsed).`);
  if (musicRel && route !== "music-to-video") custom.push(`**Music:** the user chose \`${musicRel}\`${D.music.title ? ` (${D.music.title})` : ""} as the bed for the whole film. After the audio step's \`fetch-sfx\` and before \`assemble-index\`, run \`node "${path.join(rasa, "video.mjs")}" audio-lock --project-dir . --music ${musicRel}\` so that exact track is used.`);
  else if (D.music === "none") custom.push("**Music:** none (the storyboard says `music: none`).");
  else if (D.music && D.music.mood) custom.push(`**Music:** mood "${D.music.mood}" (the storyboard's \`music:\` field).`);
  // the animatic's approved key frames: one still per scene, the visual target every frame worker matches
  const keyframes = (D.keyframes || D.styleframes || []).map((k) => (typeof k === "string" ? { image: k } : k)).filter((k) => k && k.image && fs.existsSync(rel(k.image)));
  if (keyframes.length) {
    fs.mkdirSync(path.join(dir, "assets", "keyframes"), { recursive: true });
    const kf = keyframes.map((k) => { const to = path.join("assets", "keyframes", (k.scene ? `${k.scene}` : path.basename(k.image, path.extname(k.image))) + path.extname(k.image)); fs.copyFileSync(rel(k.image), path.join(dir, to)); wrote.push(to); return to; });
    custom.push(`**Key frames are approved.** The user approved one key frame per scene in the animatic: ${kf.map((k) => `\`${k}\``).join(", ")}. Each is the visual target for its scene (composition, type, colour, the moment that matters); give every frame worker its scene's key frame as a reference and build toward it. Motion adds to it; it never replaces its design.`);
  }
  if (!footage) custom.push(`**Sound:** only causal sound. After the audio step's \`fetch-sfx\`, replace its cue list with the \`audio_meta_sfx\` from \`node "${path.join(rasa, "sound.mjs")}" sfx-plan --scenes <timeline.json> --bed assets/music-bed.wav --words audio_meta.json --project .\` (SFX only on visible events, budgeted, no whoosh per cut, none where the music already hits). The music bed is edited to picture; never loop it.`);
  if (!footage && M) {
    custom.push(`**Motion is decided:** ${motionLabel(M)}. Its contract is appended to frame.md (every frame worker reads it). After the workflow writes its frame packets, run \`node "${path.join(rasa, "video.mjs")}" inject --project-dir .\` so every packet carries it too, and append DISPATCH.md to every frame-worker dispatch.`);
    custom.push(`**Check:** after the workflow's verify step and before its render question, run \`node "${path.join(rasa, "obey.mjs")}" --project .\` and \`node "${path.join(rasa, "slop.mjs")}" --project .\` (AI-slop tells); after any repair, re-run lint, check and snapshots, then obey and slop.`);
  }
  if (dirInstalled) custom.push(`**Art direction is decided:** ${dirInstalled.direction.style_name}. DIRECTION.md is the full brief (every decision in proper motion-design terms, with what to do and what it is not); its binding summary is in frame.md and goes into every frame packet with the motion contract (\`video.mjs inject\`). Design every frame from it; do not substitute the workflow's default visual-design lens where they differ.`);
  if (footage && D.footage) custom.push(`**Style (pre-approved, skip the style questions):** ${Object.entries(D.footage).map(([k, v]) => `${k}: ${v}`).join(" · ")}.`);
  const assets = [D.content ? `- Source: ${D.content}` : null, fs.existsSync(path.join(dir, "capture")) ? "- capture/ (site capture: tokens, text, screenshots, asset inventory)" : null, musicRel ? `- ${musicRel}: music bed${D.music.title ? `: ${D.music.title}` : ""}` : null, ...(D.assets || []).map((a) => `- ${typeof a === "string" ? a : `${a.path}${a.role ? `: ${a.role}` : ""}`}`)].filter(Boolean);
  const receipts = D.receipts || {};
  put(
    "BRIEF.md",
    `---\n${fmLines.join("\n")}\n---\n\n## Intent\n\n${D.concept ? `**${D.concept.title}.** ${D.concept.text}` : D.message}\n\n## Assets\n\n${assets.join("\n") || "- none"}\n\n## Customizations\n\n${custom.map((c) => `- ${c}`).join("\n")}\n\n## Notes\n\nDirected with RasanAI.\n${(receipts.stated || []).length ? `\nStated by the user:\n${receipts.stated.map((r) => `- ${r}`).join("\n")}\n` : ""}${(receipts.agent || []).length ? `\nDecided by the agent (receipts):\n${receipts.agent.map((r) => `- ${r}`).join("\n")}\n` : ""}`
  );

  // ---- DISPATCH.md: appended to every frame-worker / planner / repair dispatch
  if (!footage && M) {
    put(
      "DISPATCH.md",
      `# RasanAI dispatch addendum (entire video)\n\nAppend this whole file to every subagent the /${route} workflow dispatches to build or repair frames. The same contract is appended to frame.md and injected into every frame packet.\n\n## Decided before the build (do not re-decide)\n\n- Message: ${q(D.message)}\n- Plan: STORYBOARD.md (approved), ${fs.existsSync(path.join(dir, "SCRIPT.md")) ? "SCRIPT.md (locked narration)" : "no narration"}\n- Look: frame.md${preset ? ` (${preset})` : designMd ? ` (the project's brand reference, ${path.basename(designMd)})` : D.look && D.look.name ? ` (${D.look.name})` : ""}\n${dirInstalled ? `- Art direction: DIRECTION.md (${dirInstalled.direction.style_name})\n` : ""}- Music: ${musicRel || (D.music === "none" ? "none" : D.music && D.music.mood ? D.music.mood : "workflow default")}\n${fs.existsSync(path.join(dir, "assets", "keyframes")) ? "- Key frames: assets/keyframes/<scene id>.png, approved by the user. Build each scene toward its key frame.\n" : ""}\n${contractText(M, { lengthS, W, H, video: true, feel })}${dirInstalled ? `\n${dirInstalled.section}` : ""}\n## Check\n\n\`node "${path.join(rasa, "obey.mjs")}" --project "${dir}"\` must exit 0 before the render question (frame files are checked; the assembled index.html and captions are the workflow's own), and so must \`node "${path.join(rasa, "slop.mjs")}" --project "${dir}"\` (no AI-slop tells: glow text, uniform entrances, generic copy, whoosh per cut, looping music).\n`
    );
  }

  // ---- confirmed preferences only
  const prefsRecorded = [];
  const mediaUse = findSkill("media-use");
  const C = D.confirmed || {};
  if (mediaUse && !footage) {
    const prefs = path.join(mediaUse, "scripts", "prefs.mjs");
    const rec = (key, value, extra = []) => {
      try {
        run("node", [prefs, "record", "--hyperframes", dir, "--key", key, "--value", String(value), ...extra]);
        prefsRecorded.push(`${key}=${value}`);
      } catch {}
    };
    if (D.destination && C.destination) rec("destination", D.destination);
    if (C.aspect) rec("aspect", aspect);
    if (C.language) rec("language", D.language || "en");
    if (preset && C.look) rec("style_preset", preset, ["--workflow", route]);
    if (D.voice && D.voice.id && C.voice) rec("voice", D.voice.id);
  }

  console.log(JSON.stringify({ ok: true, route, project_dir: dir, length_s: lengthS, wrote, moved_aside: moved, prefsRecorded, look_notes: lookNotes, direction: dirInstalled ? dirInstalled.direction.style_name : null, next: `Read ~/.claude/skills/${route}/SKILL.md and run it on ${path.relative(process.cwd(), dir) || "."}: BRIEF.md exists, so it asks nothing and adopts the plan. Follow BRIEF.md's Customizations at the named hook points.` }, null, 2));
}
