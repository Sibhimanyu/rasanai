#!/usr/bin/env node
// The anti-slop gate: checks a built film for the tells viewers read as generic AI video, before the render
// question (next to obey.mjs, which checks the motion contract). Evidence: /references/craft.md "Anti-slop".
//   node slop.mjs --project videos/<name> [--scenes <scenes.json>] [--video <render.mp4>] [--style <preset id>] [--format reel] [--run <run>] [--score <score.json>] [--no-text-fit] [--no-chrome] [--chrome-allow <rule ids>] [--json]
// Hero effects (glow, blur-in, particles) are budgets, not bans: allowed on the hero up to the score's `budget`
// (lib/budget.mjs); the same effect on every element is the error.
// With a brand (the run's research/brand/assets/, found from --run, from "<run>/frames", or from the project's
// assets/brand/) it also checks every logo on screen is the downloaded file (rule "logo-not-the-file").
// Reads the project's compositions (HTML/CSS/JS), its scenes/storyboard timing, its audio plan and, when given,
// the rendered video. Also loads the built compositions headlessly and measures every visible text in the real DOM
// at 10 fps (rule "text-cropped": a line that crosses the frame edge for more than 0.4 s, or sits outside the 6% safe
// area at rest; lib/textfit.mjs; --no-text-fit skips it). The same pass reads line blocks: "text-too-brief" (a statement-size
// line of 3+ words readable for less than 0.6 s + 0.3 s per word; data-read="skim" opts out) and "text-overlap" (two readable
// lines on top of each other for 0.3 s or more; data-overlap="ok" opts out). Cut rhythm: "uniform-shots" (scene-length variation under
// 0.2) and "narrow-rhythm" (5+ shots, longest under 4x the shortest, end card, flashes under 0.4 s and shots whose length is set by reading time left out), the second also
// measured on the render's hard cuts (lib/carry.mjs) when --video is given; both are warnings.
// The same headless pass reads the page chrome (rules kicker-over-headline, deck-layout, typed-headline, vibe-*, chapter-counter, progress-hairline, tracked-caps-label, corner-brackets, header-footer-bar, corner-micro-label, pinned-element: lib/chrome-lint.mjs; --no-chrome skips it). Exit 0 = clean or warnings only; 2 = problems to fix (each with a fix); 1 = could not run. Exit 0 = clean or warnings only; 2 = problems to fix (each with a fix); 1 = could not run.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { readLogos, scanLogos } from "./lib/logos.mjs";
import { textFit } from "./lib/textfit.mjs";
import { chromeLint } from "./lib/chrome-lint.mjs";
import { readTime, wordCount } from "./lib/reading.mjs";
import { readBudget, budgetFor, budgetLimit } from "./lib/budget.mjs";
import { decodeGrey, findCuts } from "./lib/carry.mjs";
import { sfxMode, sfxLimit, sfxOver } from "./lib/audio.mjs";

const args = parseArgs();
track("Checking for generic AI-video tells", "Slop check done");
const dir = args.project ? path.resolve(String(args.project)) : null;
if (!dir || !fs.existsSync(dir)) die("--project <videos/name> required (a HyperFrames project folder)");
const findings = [];
const add = (rule, severity, where, why, fix) => findings.push({ rule, severity, where, why, fix });

// ---- gather sources ----
const walk = (d, out = []) => { for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory() && !/node_modules|renders|\.superseded|assets/.test(f)) walk(p, out); else if (/\.(html|css|js|mjs)$/.test(f)) out.push(p); } return out; };
const files = walk(dir).filter((f) => !/\/snapshots?\//.test(f));
const src = Object.fromEntries(files.map((f) => [path.relative(dir, f), fs.readFileSync(f, "utf8")]));
const allCode = Object.values(src).join("\n");
const style = String(args.style || "");
// visible copy: text nodes of the compositions (tags stripped), plus quoted strings used as text in scripts
const visible = Object.entries(src).flatMap(([f, s]) => {
  if (!f.endsWith(".html")) return [];
  const body = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return body.replace(/<[^>]+>/g, "\n").split("\n").map((t) => t.replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "").trim()).filter((t) => t.length > 1).map((t) => ({ f, t }));
});

// ---- 1. copy ----
const BANNED = ["seamless", "seamlessly", "revolutionize", "revolutionise", "revolutionary", "unlock", "supercharge", "streamline your", "game-changer", "game changer", "next-level", "next level", "in today's fast-paced", "empower", "effortless", "cutting-edge", "cutting edge", "elevate your", "harness the power", "unleash", "all-in-one", "reimagine", "transform the way", "the future of", "like never before", "say goodbye to", "look no further", "take it to the next"];
for (const { f, t } of visible) {
  const low = t.toLowerCase();
  const hit = BANNED.find((b) => low.includes(b));
  if (hit) add("generic-copy", "error", `${f}: "${t.slice(0, 70)}"`, `"${hit}" is stock launch-video copy; viewers read it as AI.`, "Say the specific thing instead: the real outcome, number or feature, in the product's own words.");
  if (/lorem ipsum|\bTODO\b|\{\{|\bplaceholder\b|example\.com|john doe|acme/i.test(t)) add("placeholder", "error", `${f}: "${t.slice(0, 70)}"`, "Placeholder text reached the film.", "Replace with the real copy (or remove the element).");
  if ((t.match(/—/g) || []).length >= 1 && t.split(/\s+/).length <= 14) add("em-dash-copy", "warn", `${f}: "${t.slice(0, 70)}"`, "Em dashes in short on-screen lines read as AI copy.", "Use a full stop, a comma or a line break.");
  if (/\bnot (just )?(a |an |the )?[\w' -]{1,30}[,;:.—–-]+\s*(it'?s|it is|but|this is)\b/i.test(t) || /\bisn'?t (just )?[\w' -]{1,30}[.,;—–-]+\s*it'?s\b/i.test(t)) add("not-x-its-y", "error", `${f}: "${t.slice(0, 70)}"`, "\"Not X, it's Y\" is the signature AI copy construction.", "State Y directly.");
  if (/!{1,}/.test(t) && t.length < 80) add("hype-punctuation", "warn", `${f}: "${t.slice(0, 70)}"`, "Exclamation marks in on-screen copy read as hype.", "Let the statement land without it.");
}
if (visible.length && /^introducing\b/i.test(visible[0].t)) add("introducing-opener", "warn", `${visible[0].f}`, "Opening on \"Introducing…\" is the default launch opener.", "Open on the hook: the outcome, the tension or the product doing its thing.");

// ---- 1b. logos: every logo on screen is the file researched from the brand's own site ----
{
  const cands = [args.run && args.run !== true ? path.join(path.resolve(String(args.run)), "research", "brand", "assets") : null, path.basename(dir) === "frames" ? path.join(path.dirname(dir), "research", "brand", "assets") : null, path.join(dir, "assets", "brand")].filter(Boolean);
  const adir = cands.find((c) => fs.existsSync(path.join(c, "logos.json")));
  if (adir) {
    const logos = readLogos(adir);
    if (logos.problems.length) add("logo-not-the-file", "error", "research/brand/assets/logos.json", logos.problems[0], "Fix the brand assets first (crew.mjs check --role brand-researcher), then re-run.");
    else {
      const cssText = Object.entries(src).map(([f, t]) => (f.endsWith(".css") ? t : [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join("\n"))).join("\n");
      for (const f of scanLogos({ project: dir, sources: src, logos, cssText })) {
        add("logo-not-the-file", f.warn ? "warn" : "error", f.where, f.why, logos.none ? "No official logo exists for this brand: show the brand name in the brand font and no symbol. Never draw, trace or approximate a logo." : "Place the downloaded file (copy research/brand/assets/<file> into the project's assets/brand/ unchanged) with an <img>, and delete the drawn lookalike. Keep clear space and the colour version DESIGN.md names.");
      }
    }
  }
}

// ---- 2. look ----
const grads = allCode.match(/(?:linear|radial|conic)-gradient\([^)]*\)/gi) || [];
const hue = (hex) => { const n = parseInt(hex.slice(1).padEnd(6, "0").slice(0, 6), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return -1; let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h *= 60; return h < 0 ? h + 360 : h; };
const aiGrad = grads.filter((g) => { const hs = (g.match(/#[0-9a-f]{6}/gi) || []).map(hue).filter((x) => x >= 0); return hs.some((x) => x >= 250 && x <= 300) && hs.some((x) => x >= 190 && x < 250); });
if (aiGrad.length && !/aurora|holographic|y2k|vapor|synth/.test(style)) add("ai-gradient", "error", `${aiGrad.length} purple-to-blue gradient(s)`, "Purple-blue gradients are the default 'AI' look.", "Use the style's palette: flat fields, one accent, or a gradient within one hue family.");
if (/lens-?flare|flare\.png/i.test(allCode)) add("lens-flare", "warn", "lens flare", "Lens flares read as template decoration.", "Remove it.");
// Corner labels have ONE rule name, corner-micro-label (lib/chrome-lint.mjs measures it in the rendered DOM). The timecode/BPM-style
// strings found in the source are only a second way to see the same thing: section 5c merges them into that finding (or, when the
// page-chrome pass did not run, reports them under the same name), so no element is reported twice.
const hudStyle = /hud|fui|terminal|telemetry|broadcast|vhs/.test(style);
const cornerLabelTexts = [...new Set(visible.filter(({ t }) => /^(\d{1,2}:\d{2}(:\d{2})?|\d{2,3}\s?bpm|rec\s?●?|sys\b|v\d\.\d)/i.test(t)).map(({ t }) => t))];
const centered = (allCode.match(/text-align\s*:\s*center/g) || []).length, lefty = (allCode.match(/text-align\s*:\s*(left|start)/g) || []).length;
if (centered >= 6 && centered > lefty * 4) add("centered-everything", "warn", `${centered} centred text blocks, ${lefty} left-aligned`, "Centring everything is the template default.", "Vary composition: left-aligned headlines, asymmetric layouts, text on the grid.");
const fams = new Set((allCode.match(/font-family\s*:\s*['"]?([A-Za-z0-9 ]+)/g) || []).map((m) => m.replace(/font-family\s*:\s*['"]?/, "").trim().toLowerCase()).filter((x) => !/^(inherit|sans-serif|serif|monospace|system-ui|var)$/.test(x)));
if (fams.size && [...fams].every((x) => x === "inter")) add("default-type", "warn", "only Inter", "Inter everywhere is the default, anonymous choice.", "Use the chosen style's type pairing (frame.md).");
if (fams.size > 3) add("too-many-typefaces", "warn", [...fams].join(", "), "More than three typefaces reads as unconsidered.", "Two families (display + body), plus mono only if the style needs it.");

// ---- 3. motion ----
const idle = (allCode.match(/repeat\s*:\s*-1[^}]*yoyo\s*:\s*true|yoyo\s*:\s*true[^}]*repeat\s*:\s*-1/g) || []).length;
if (idle) add("idle-breathing", "error", `${idle} infinite yoyo loop(s)`, "Idle breathing/floating loops are 'lazy motion' (and break seek-safety).", "Replace with staged reveals, motivated camera or UI life; a hold is reading time and still carries secondary motion (a line's carry, the next element arriving).");
const spin = /rotation\s*:\s*360|rotate\(360deg\)/.test(allCode) && /logo/i.test(allCode);
// entrances: every gsap.from / fromTo classified by what it animates; one kind everywhere is "everything fades up"
const KEYS = ["opacity", "autoAlpha", "x", "y", "xPercent", "yPercent", "scale", "scaleX", "scaleY", "rotation", "rotationX", "rotationY", "clipPath", "filter", "skewX", "skewY", "width", "height", "drawSVG", "strokeDashoffset"];
const entrances = [...allCode.matchAll(/\.(?:from|fromTo)\(\s*[^,]+,\s*\{([^}]*)\}/g)].map((m) => [...new Set([...m[1].matchAll(/([A-Za-z]+)\s*:/g)].map((k) => (k[1] === "autoAlpha" ? "opacity" : k[1])).filter((k) => KEYS.includes(k)))].sort().join("+")).filter(Boolean);
if (entrances.length >= 8) {
  const byKind = entrances.reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {});
  const [top, n] = Object.entries(byKind).sort((a, b) => b[1] - a[1])[0];
  const share = n / entrances.length;
  if (share > 0.5) add("uniform-entrances", /^opacity\+(y|yPercent)$/.test(top) ? "error" : "warn", `${n} of ${entrances.length} entrances are ${top}`, "When every element arrives the same way (usually fading up), the film reads as a template.", "No entrance kind on more than ~30% of entrances: mix masks and wipes, scale from an anchor, a cut-in, a shared-element move, type that builds, and elements that are simply there (craft.md, Motion).");
}
if (spin) add("spinning-logo", "warn", "a 360° logo rotation", "Spinning logos are a template tell.", "Land the logo with the film's motion language: a mask, a snap into the grid, a match cut.");

// ---- 4. timing ----
// cut rhythm (onetake: "never cut on a metronome; shot lengths should vary by 4x or more"): longest over shortest shot, the end card
// (last) and flashes under 0.4 s left out; 5+ shots to judge. Used on the scenes here and on the render's hard cuts below.
// A shot whose length is set by reading time (within 15% of 0.6 s + 0.3 s per word of its line) is not a free choice, so a
// line-per-beat film is judged on its free shots only (`reads` = each shot's reading time, 0 for none).
const RHYTHM = { min_shots: 5, ratio: 4, flash_s: 0.4, read_slack: 0.15 };
// (readTime: lib/reading.mjs, the one formula; plan-level here, so no slack)
const rhythm = (lens, reads = []) => {
  const ds = lens.slice(0, -1).filter((d, i) => d >= RHYTHM.flash_s && !(reads[i] && d <= reads[i] * (1 + RHYTHM.read_slack)));
  if (lens.length < RHYTHM.min_shots || ds.length < 2) return null;
  const lo = Math.min(...ds), hi = Math.max(...ds);
  return { ratio: hi / lo, hi, lo, n: ds.length };
};
const narrow = (r, what) => r && r.ratio < RHYTHM.ratio ? add("narrow-rhythm", "warn", `${what}: longest ${r.hi.toFixed(1)} s over shortest ${r.lo.toFixed(1)} s is ${r.ratio.toFixed(1)}x across ${r.n} shots (aim for ≥ ${RHYTHM.ratio}x)`, "Shot lengths within a narrow band cut on a metronome even when they are not identical.", "Group quick beats and give the reveal the longest shot (craft.md §2, Timing, pacing and readability).") : null;
let scenes = null;
const sceneFile = args.scenes ? path.resolve(String(args.scenes)) : [path.join(dir, "scenes.json"), path.join(dir, "timeline.json")].find((p) => fs.existsSync(p));
if (sceneFile && fs.existsSync(sceneFile)) { try { const j = JSON.parse(fs.readFileSync(sceneFile, "utf8")); scenes = (j.scenes || j).map((s) => ({ title: s.title, d: Number(s.duration_s ?? s.duration) || 0, text: String(s.on_screen || s.line || "") })); } catch {} }
if (scenes && scenes.length >= 3) {
  const ds = scenes.map((s) => s.d).filter(Boolean), mean = ds.reduce((a, b) => a + b, 0) / ds.length, sd = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length);
  if (ds.length >= 4 && sd / mean < 0.2) add("uniform-shots", "warn", `every scene ≈ ${mean.toFixed(1)} s (variation ${(sd / mean).toFixed(2)}; aim for ≥ 0.35)`, "Near-identical scene lengths make a slideshow rhythm: \"it's just a PowerPoint\".", "Vary rhythm: group quick beats, give the reveal the longest shot (see craft.md §2, Timing, pacing and readability).");
  narrow(rhythm(scenes.map((s) => s.d), scenes.map((s) => readTime(s.text))), "scenes");
  scenes.forEach((s, i) => { const w = wordCount(s.text); const need = readTime(w); if (w && s.d && s.d < need) add("unreadable", "error", `scene ${i + 1} "${s.title}"`, `${w} words on screen for ${s.d} s; needs about ${need.toFixed(1)} s to read.`, "Cut the copy or lengthen the scene; never speed it up."); });
  const last = scenes[scenes.length - 1]; if (last.d && last.d < 1.8) add("no-end-hold", "error", `last scene ${last.d} s`, "The ending has no hold: the name and call to action vanish.", "Give the end card 2–3 s: its elements land in sequence, then at most 1.5 s still (motion-gate.mjs measures it).");
  if (scenes[0].d > 4 && !scenes[0].text) add("slow-hook", "warn", `scene 1 is ${scenes[0].d} s with no line`, "Nothing lands in the first 2 s.", "Open on the hook: a claim in ≤4 words or the product doing its thing within 1.5 s.");
}

// ---- 4b. finish: default-on, hero effects on a budget, uniform use is the tell ----
// Glow, blur-in and particles are allowed a few times per film on the hero, with a reason in the score's `budget`
// (lib/budget.mjs; references/craft.md "Finish and budgets"). The same effect on more elements than the budget allows,
// or on every line, is the AI tell and stays an error. The finish layer itself (grain, soft shadows, a lit ground) is
// expected on every film unless the brand film measured none (brandfilm.mjs measure: finish.layerOff).
{
  const runDir = args.run && args.run !== true ? path.resolve(String(args.run)) : null;
  const scoreFile = args.score ? path.resolve(String(args.score)) : null;
  let budget = [];
  if (scoreFile) { try { budget = readBudget(JSON.parse(fs.readFileSync(scoreFile, "utf8"))); } catch {} }
  else if (runDir) budget = readBudget(runDir);
  const hasScore = !!(scoreFile || (runDir && fs.existsSync(path.join(runDir, "motion", "score.json"))));
  const lim = budgetLimit(scenes ? scenes.reduce((a, s) => a + s.d, 0) : Number(args.film || 0));
  // the finish runtimes (rasan-camera, rasan-motion, vendored GSAP) are not the film's own choices
  const own = Object.entries(src).filter(([f]) => !/(^|\/)(rasan-[a-z0-9-]+|gsap[^/]*|vendor\/[^/]+)\.(m?js|css)$/i.test(f)).map(([, t]) => t).join("\n");
  const spend = (effect, n, what, why, fix) => {
    const planned = budgetFor(budget, effect).length;
    if (n > lim) add(`${effect}-uniform`, "error", `${n} ${what} (budget: ${lim} per film, hero only)`, why, fix);
    else if (n && !planned) add(`${effect}-unbudgeted`, "warn", `${n} ${what}`, `${effect} is allowed on the hero, at most ${lim} times, with a reason; this film has no budget entry for it${hasScore ? "" : " (no score found: pass --run or --score)"}.`, `Name each use in the score's budget: {"effect": "${effect}", "scene": <n>, "target": "<the hero>", "reason": "<why this moment>"}; or remove it.`);
  };
  const neon = /neon|cyber|synthwave|vapor|glow/.test(style);
  const glowText = (own.match(/text-shadow\s*:[^;"}]*?\b0\s+0\s+(\d+)px[^;"}]*/gi) || []).filter((m) => Number((m.match(/0\s+0\s+(\d+)px/) || [])[1]) >= 8);
  const glowBox = (own.match(/(?:box-shadow\s*:|drop-shadow\()\s*0(?:px)?\s+0(?:px)?\s+(\d+)px[^;"})]*/gi) || []).filter((m) => Number((m.match(/0(?:px)?\s+0(?:px)?\s+(\d+)px/) || [])[1]) >= 16);
  if (!neon) spend("glow", glowText.length + glowBox.length, "glowing text-shadows / box glows", "Glow on every element is the most-named AI video tell; once on the hero, with a reason, it is light (Sovra, Google's rim glow).", "Keep glow for the hero moment(s) the budget names; take it off everything else and get emphasis from size, weight, colour or position.");
  const blurIn = [...own.matchAll(/\.(?:from|fromTo)\(\s*[^,]+,\s*\{([^}]*)\}/g)].filter((m) => /filter\s*:\s*["'`]?blur\(\s*[1-9]/.test(m[1])).length;
  spend("blur-in", blurIn, "blur-in entrances", "Every word blurring in is the uniform AI entrance; one blur-in on the hero line is a choice (Sovra's words).", "Keep blur-in for the budgeted hero line(s); give the rest entrances by their nature (mask, cut-in, build).");
  const particleWords = /particle|bokeh|sparkle|starfield|galaxy|floating-?dots/i.test(own), dots = (own.match(/border-radius\s*:\s*50%/g) || []).length > 40;
  if ((particleWords || dots) && !/space|orbital|point-cloud|star/.test(style) && !budgetFor(budget, "particles").length) add("particles-unbudgeted", "warn", "particles / bokeh / sparkles", "Ambient particles everywhere are filler viewers read as AI video; a dot field or burst that IS the story's carrier, once, is a technique.", `Budget it on the hero moment with a reason ({"effect": "particles", ...}, at most ${lim}), or replace with one motivated element from the story.`);
  // the default finish layer: grain, a soft shadow and a lit or tinted ground, unless the brand film measured none
  let layerOff = false;
  if (runDir) { try { const g = JSON.parse(fs.readFileSync(path.join(runDir, "brand-film", "grammar.json"), "utf8")); layerOff = !!(g.measured && g.measured.finish && g.measured.finish.layerOff); } catch {} }
  const hasCamera = /RasanCamera|rasan-camera/.test(allCode);
  const grain = hasCamera || /feTurbulence|grain|noise\.(png|svg|webp)/i.test(own);
  const softShadow = hasCamera || /box-shadow\s*:[^;"}]*\d+px\s+\d{2,}px/i.test(own) || /drop-shadow\(/i.test(own);
  const litGround = hasCamera || /radial-gradient\(/i.test(own);
  const missing = [!grain && "grain", !softShadow && "soft shadows", !litGround && "a lit, tinted ground"].filter(Boolean);
  if (!layerOff && missing.length >= 2) add("finish-missing", "warn", `no ${missing.join(", no ")}`, "The finish layer is default-on: a tinted living ground, soft multi-layer shadows, a key light, 1-2% grain on a flat brand (2-4% otherwise), a 10-30% vignette. Without it a flat brand reads as a white void.", "Install RasanCamera (camera.mjs install) and use ground(), keyLight(), shadowLadder() and grain(); off only when brandfilm.mjs measured the brand film's finish as zero (finish.layerOff), and then the film wins on type scale and photography.");
}

// ---- 5. sound ----
const filmLen = scenes ? scenes.reduce((a, s) => a + s.d, 0) : Number(args.film || 0);
const assets = path.join(dir, "assets");
const bed = fs.existsSync(assets) ? fs.readdirSync(assets).find((f) => /^music-bed\.|bgm|music/i.test(f) && /\.(wav|mp3|m4a|ogg)$/i.test(f)) : null;
const probe = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { encoding: "utf8" }); return Number(r.stdout.trim()) || 0; };
if (bed && filmLen) { const bl = probe(path.join(assets, bed)); if (bl && bl + 0.5 < filmLen) add("music-loop", "error", `${bed} is ${bl.toFixed(1)} s for a ${filmLen.toFixed(1)} s film`, "A bed shorter than the film loops audibly.", "Pick a longer track or edit by structure: node scripts/sound.mjs fit --track <file> --film <s>."); }
// an SFX is an audio source that is not the music bed or a voice: the whole src string is tested (path and name), not the
// extension. <audio> tags when the film has them (one per cue), else every quoted audio path.
const audioRefs = (() => {
  const tags = [...allCode.matchAll(/<audio\b[^>]*>/gi)].map((m) => (m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || "");
  return tags.length ? tags : [...allCode.matchAll(/["']([^"'\s]+\.(?:wav|mp3|ogg|m4a|aac|flac))["']/gi)].map((m) => m[1]);
})();
const sfxCount = audioRefs.filter((r) => !/music|bgm|\bbed\b|[-_/]bed[-_.]|voice|(^|[-_/])vo[-_.]|narrat/i.test(r)).length;
const narratedFilm = audioRefs.some((r) => /voice|(^|[-_/])vo[-_.]|narrat/i.test(r));
const whoosh = (allCode.match(/whoosh|swoosh|swish/gi) || []).length;
const sfxMd = sfxMode({ format: args.format, narrated: narratedFilm });
if (filmLen && sfxOver(sfxCount, sfxMd, filmLen)) add("sfx-overload", "error", `${sfxCount} SFX in ${filmLen.toFixed(0)} s`, `Too many sound effects: every beat has a sound, so none matter (the budget, shared with sound.mjs: ${sfxLimit(sfxMd, filmLen)} in ${filmLen.toFixed(0)} s for a ${sfxMd} film).`, "Only visible, causal events get a sound (sound.md); skip where the music already hits.");
const cuts = scenes ? scenes.length - 1 : 0;
const whooshCap = cuts ? Math.max(1, Math.ceil(cuts / 3)) : 3;
if (whoosh > whooshCap) add("whoosh-per-cut", "error", `${whoosh} whooshes${cuts ? ` for ${cuts} transitions` : ""}`, "A whoosh on every cut is the most common SFX tell.", "At most one whoosh in three transitions (and one per ~20 s): keep it for the signature transition.");

// ---- 5b. text-fit: every word meant to be read sits inside the frame ----
if (!args["no-text-fit"]) {
  const tf = await textFit(dir);
  for (const f of tf.findings) add(f.check, "error", `${f.file}: "${f.text}" ${f.from}-${f.to} s`, f.message, f.fix);
  if (tf.could_not_run.length) add("text-fit-skipped", "warn", dir, `${tf.could_not_run[0]} (the text-fit check did not run)`, "Install Chrome (npx hyperframes browser ensure, or set RASANAI_CHROME) and re-run: the composition's text was not measured.");
}

// ---- 5c. page chrome: the HUD / slide-deck / vibe-coded-UI tells, measured in the real DOM ----
// Adapted from motionmaxxing (Apache-2.0, Tejas Makwana), scripts/lint.mjs.
// lib/chrome-lint.mjs seeks every composition like text-fit and reads the held text blocks and shapes. Rules (ids in the
// findings): kicker-over-headline, deck-layout, typed-headline, vibe-ui-card, vibe-greeting, vibe-ui-tell, chapter-counter,
// progress-hairline, tracked-caps-label, corner-brackets, header-footer-bar, corner-micro-label, pinned-element. A brand
// film's own device is honoured: grammar.json's measured.chrome lists rule ids that brand's films use (found from --run).
// --no-chrome skips it; --chrome-allow <ids> lists rule ids to allow. Exempt: text inside a UI surface or data-ui, the
// vibe rules inside data-ui="captured", anything inside data-chrome="allow", and wordmark/logo elements.
let chromeElements = null;
if (!args["no-chrome"]) {
  let allow = String(args["chrome-allow"] && args["chrome-allow"] !== true ? args["chrome-allow"] : "").split(",").map((s) => s.trim()).filter(Boolean);
  const gRun = args.run && args.run !== true ? path.resolve(String(args.run)) : path.basename(dir) === "frames" ? path.dirname(dir) : null;
  if (gRun) { try { const g = JSON.parse(fs.readFileSync(path.join(gRun, "brand-film", "grammar.json"), "utf8")); if (g.measured && Array.isArray(g.measured.chrome)) allow = allow.concat(g.measured.chrome.map(String)); } catch {} }
  const cl = await chromeLint(dir, { allow });
  chromeElements = cl.elements;
  for (const f of cl.findings) { if (hudStyle && /^corner-(micro-label|brackets)$/.test(f.rule)) continue; add(f.rule, f.severity, f.where, f.why, f.fix); } // a HUD/broadcast style means its corner chrome
  if (cl.could_not_run.length) add("chrome-lint-skipped", "warn", dir, `${cl.could_not_run[0]} (the page-chrome check did not run)`, "Install Chrome (npx hyperframes browser ensure, or set RASANAI_CHROME) and re-run: the page chrome was not measured.");
}

// corner-micro-label, once: the source's timecode/BPM strings the rendered pass did not already see are merged into its finding
if (!hudStyle && cornerLabelTexts.length) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(((chromeElements || {})["corner-micro-label"] || []).map(norm));
  const rest = cornerLabelTexts.filter((t) => !seen.has(norm(t)));
  const hit = findings.find((f) => f.rule === "corner-micro-label");
  if (hit && rest.length) { hit.where += ` (+${rest.length} timecode/BPM-style label${rest.length > 1 ? "s" : ""} in the source: ${rest.slice(0, 3).map((t) => JSON.stringify(t.slice(0, 24))).join(", ")})`; if (seen.size + rest.length >= 2) hit.severity = "error"; }
  else if (!hit && cornerLabelTexts.length >= 2) add("corner-micro-label", "error", `${cornerLabelTexts.length} timecode/BPM-style labels`, "Corner labels with timecodes and BPM are now a recognised Opus-showreel tell.", "Remove them unless the style is a HUD/broadcast style that means it.");
}

// ---- 6. the rendered video ----
if (args.video && fs.existsSync(String(args.video))) {
  const v = path.resolve(String(args.video));
  const fr = spawnSync("ffmpeg", ["-hide_banner", "-i", v, "-vf", "freezedetect=n=0.003:d=0.8", "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8" });
  const starts = [...(fr.stderr || "").matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1])), ends = [...(fr.stderr || "").matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const dur = probe(v);
  starts.forEach((s, i) => { const e = ends[i] ?? dur; if (e < dur - 3.2 && e - s >= 0.8) add("dead-air", "error", `still frame ${s.toFixed(1)}–${e.toFixed(1)} s`, "A still stretch of 0.8 s or more mid-film reads as dead air (motion-gate.mjs measures the same).", "Stage something meaningful in that stretch (a reveal, a move, UI life, a line's carry) or cut it: holds are reading time and still carry secondary motion."); });
  // the render's own rhythm: shot lengths between hard cuts (lib/carry.mjs findCuts)
  try {
    const cuts = findCuts(decodeGrey(v));
    const bounds = [0, ...cuts, dur];
    narrow(rhythm(bounds.slice(1).map((t, i) => t - bounds[i])), "render");
  } catch {}
  const ld = spawnSync("ffmpeg", ["-hide_banner", "-i", v, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const I = Number(((ld.stderr || "").match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0]);
  if (!Number.isNaN(I) && I !== 0 && Math.abs(I + 14) > 1.5) add("loudness", "error", `${I} LUFS`, "Web/social films should sit at about −14 LUFS integrated.", "Normalise the mix (sound.mjs check / render).");
  const bl = spawnSync("ffmpeg", ["-hide_banner", "-i", v, "-vf", "blackdetect=d=0.4:pix_th=0.08", "-an", "-f", "null", "-"], { encoding: "utf8" });
  if (/black_start:0(\.0+)?\b/.test(bl.stderr || "")) add("black-open", "warn", "black frames at the start", "The film opens on black; the first frame is also the thumbnail.", "Open on the first designed frame (and make frame 0 postable).");
}

const errors = findings.filter((f) => f.severity === "error").length;
const out = { ok: !errors, errors, warnings: findings.length - errors, files: files.length, scenes: scenes ? scenes.length : 0, findings };
console.log(args.json ? JSON.stringify(out) : JSON.stringify(out, null, 2));
process.exit(errors ? 2 : 0);
