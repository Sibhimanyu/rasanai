#!/usr/bin/env node
// Story plates: one real Codex image per hero shot (the signature moment and the key shots) of each concept, so the story boards show pictures, not type on a gradient.
//   node story-plates.mjs --concept <story/treatments.json | concept.json> --out <story/plates> [--pick <id|index>] [--max 4] [--concurrency 3] [--force]
// The file may be one concept, an array, or {concepts|treatments: [...]}; a concept is anything with shots[] (or concept.shots[]). Each concept's atlas art block
// (style_world) builds the prompt through imagegen.mjs generate --style, palette-locked, with its negatives; the first plate of a concept (the signature shot) is the
// anchor and goes to the others as --ref, so one concept stays one world. Plates land in <out>/<concept id>/<shot id>.png and the path is written into shot.image.
// Image generation unavailable (imagegen.mjs status is not "ready") or a plate failing: nothing is faked. <out>/plates.json says so and the board labels the template
// fallback (scripts/lib/story-board.mjs). Exit 0 always for "unavailable" (the template is the fallback), 2 only when the input has no concept with shots.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { ensureShotIds, styleWorldId, carrierOf, signatureOf, atlasArt } from "./lib/concept-schema.mjs";

const args = parseArgs();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGEGEN = path.join(HERE, "imagegen.mjs");
const s = (v) => (v == null ? "" : String(v));
// LAUNCH grammar plates (references/launch-grammar.md): a launch-film concept (it names hook_lines / capabilities / ground, or --launch) whose style_world is absent or the default is drawn
// as launch key frames: kinetic type on a neutral or brand-gradient ground, the carrier motif, a simplified UI mockup, brand palette as atmosphere. No pixel or fantasy worlds unless the concept chose one.
const DEFAULT_WORLDS = ["", "kinetic-type-only", "kinetic-launch"];
const isLaunchPlate = (c) => !!(args.launch || c.hook_lines || c.capabilities || c.signature_transition || c.ground) && DEFAULT_WORLDS.includes(styleWorldId(c).toLowerCase());
function launchPrompt(c, sh) {
  const ground = { neutral: "a clean off-white ground with generous empty space", "brand-gradient": "a soft blurred gradient ground built from the brand palette", dark: "a near-black ground with a soft brand-coloured glow" }[s(c.ground).toLowerCase()] || "a clean neutral or soft brand-gradient ground";
  const pal = c.style && c.style.palette && typeof c.style.palette === "object" ? Object.values(c.style.palette).filter((v) => /^#[0-9a-f]{6}$/i.test(s(v))).slice(0, 4).join(", ") : "";
  const brand = s((c.brand && (c.brand.colour || c.brand.color || c.brand.accent)) || c.brand_colour || (args.brand !== true && args.brand) || "");
  const colours = [brand && `brand accent ${brand}`, pal && `palette ${pal}`].filter(Boolean).join("; ");
  const car = carrierOf(c), ui = s(sh.ui_proof || sh.ui);
  return [
    `Key frame of a modern kinetic-type product launch film: ${ground}${colours ? ` (atmosphere from the ${colours}; the brand is a mood of colour, never a big logo)` : ""}.`,
    s(sh.see),
    car.what ? `One carrier motif travels the film: ${car.what}${s(sh.carrier_state) ? ` (${s(sh.carrier_state)})` : ""}, simply drawn, in the brand colour.` : "",
    ui ? `A simplified, clean recreated UI mockup as proof (${ui}): a few rows or one card, soft shadow, greyed placeholder lines, never a full-screen screenshot.` : "",
    "Large confident empty space, one clear focal point, refined editorial look, soft light, flat clean vector or soft-gradient rendering. No pixel art, no fantasy or game worlds, no characters unless the shot names one.",
    "No text, letters, logos or watermarks in the image."
  ].filter(Boolean).join(" ");
}
const log = (m) => process.stderr.write(`story-plates: ${m}\n`);

if (!args.concept || args.concept === true) die("--concept <treatments.json | concept.json> required");
if (!args.out || args.out === true) die("--out <dir> required");
const file = path.resolve(s(args.concept)), out = path.resolve(s(args.out));
let raw; try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { die(`${args.concept}: not valid JSON (${e.message})`); }
const items = Array.isArray(raw) ? raw : Array.isArray(raw.concepts) ? raw.concepts : Array.isArray(raw.treatments) ? raw.treatments : [raw];
const targetOf = (c) => (c && Array.isArray(c.shots) ? c : c && c.concept && Array.isArray(c.concept.shots) ? c.concept : null);
let targets = items.map(targetOf).filter(Boolean);
if (args.pick != null && args.pick !== true) targets = targets.filter((c, i) => s(c.id) === s(args.pick) || String(i) === s(args.pick));
if (!targets.length) die(`${args.concept}: no concept with shots[] to make plates for`);
targets.forEach(ensureShotIds);
fs.mkdirSync(out, { recursive: true });

const report = { ok: true, state: "ready", reason: "", concepts: {}, made: 0, failed: 0 };
const writeReport = () => fs.writeFileSync(path.join(out, "plates.json"), JSON.stringify(report, null, 2) + "\n");

const st = spawnSync(process.execPath, [IMAGEGEN, "status"], { encoding: "utf8" });
let status = {}; try { status = JSON.parse(st.stdout || "{}"); } catch { /* unavailable */ }
if (status.state !== "ready") {
  report.ok = false; report.state = "unavailable"; report.reason = s(status.reason || status.state || "image generation is not available");
  writeReport();
  log(`image generation unavailable (${report.reason}); the boards keep the type template and say so`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// hero shots: the signature moment, concept.hero_shots, the opener and the proof/last shot; at most --max (default 4), in film order
function heroIdx(c) {
  const sh = c.shots, at = (r) => sh.findIndex((x, i) => s(x.id) === s(r) || s(x.t) === s(r) || String(i) === s(r));
  const sig = at(signatureOf(c).shot), sigAt = sig >= 0 ? sig : sh.findIndex((x) => x.signature === true);
  const picks = [sigAt, ...(Array.isArray(c.hero_shots) ? c.hero_shots.map(at) : []), 0, Math.floor((sh.length * 3) / 4), sh.length - 1].filter((i) => i >= 0);
  const uniq = [...new Set(picks)].slice(0, Math.max(1, Number(args.max) || 4));
  return { idx: uniq.sort((a, b) => a - b), anchor: sigAt >= 0 ? sigAt : uniq[0] };
}

function generate(prompt, outFile, style, palette, ref) {
  return new Promise((resolve) => {
    const a = ["generate", "--out", outFile, "--aspect", "16:9"];
    if (style) a.push("--style", style, ...(palette ? ["--palette", palette] : []));
    a.push("--prompt", prompt);
    if (ref) a.push("--ref", ref);
    if (args.force) a.push("--force");
    const p = spawn(process.execPath, [IMAGEGEN, ...a], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = ""; p.stdout.on("data", (d) => (buf += d));
    p.on("close", (code) => { let j = {}; try { j = JSON.parse(buf); } catch { /* none */ } resolve({ ok: code === 0 && j.ok !== false, error: j.error || (code ? `exit ${code}` : "") }); });
  });
}

async function runConcept(c, n) {
  const id = s(c.id) || `c${n + 1}`, world = styleWorldId(c), dir = path.join(out, id);
  fs.mkdirSync(dir, { recursive: true });
  const art = world ? atlasArt(world) : null;
  const palette = c.style && c.style.palette_id ? s(c.style.palette_id) : "";
  const carrier = carrierOf(c).what;
  const { idx, anchor } = heroIdx(c);
  const order = [anchor, ...idx.filter((i) => i !== anchor)];
  const rec = { world: world || null, atlas_prompt: !!art, plates: [], failed: [] };
  report.concepts[id] = rec;
  let anchorFile = "";
  for (const i of order) {
    const sh = c.shots[i], f = path.join(dir, `${s(sh.id)}.png`);
    // the picture only: the film's own type lays over it, so none in the image (the board and the build add the words)
    const see = [s(sh.see), carrier && s(sh.carrier_state) ? `${carrier}: ${s(sh.carrier_state)}` : "", "No text, letters, logos or watermarks in the image."].filter(Boolean).join(" ");
    const launch = isLaunchPlate(c);
    const prompt = launch ? launchPrompt(c, sh) : art ? see : `${see} Style: ${s(c.style_world && c.style_world.description) || world || "one consistent art direction"}.`;
    log(`${id} ${s(sh.id)}${i === anchor ? " (anchor)" : ""}: generating`);
    const r = await generate(prompt, f, art && !launch ? world : "", launch ? "" : palette, i === anchor ? "" : anchorFile);
    if (r.ok && fs.existsSync(f)) {
      sh.image = f; rec.plates.push({ shot: s(sh.id), image: f }); report.made++;
      if (i === anchor) anchorFile = f;
    } else { rec.failed.push({ shot: s(sh.id), error: r.error }); report.failed++; log(`${id} ${s(sh.id)} failed: ${r.error}`); }
  }
}

const conc = Math.max(1, Math.min(4, Number(args.concurrency) || 3));
let next = 0;
await Promise.all(Array.from({ length: Math.min(conc, targets.length) }, async () => { while (next < targets.length) { const n = next++; await runConcept(targets[n], n); } }));

// duplicate check: the same bytes under two different shots means parallel jobs picked up each other's output. Keep the first (the anchor, else film order),
// regenerate each other one once (--force, a fresh temp path inside imagegen.mjs), and mark it failed when it still comes back identical.
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
function dupes() {
  const seen = new Map(), bad = [];
  for (const [cid, rec] of Object.entries(report.concepts)) for (const pl of rec.plates) {
    if (!fs.existsSync(pl.image)) continue;
    const h = md5(pl.image), first = seen.get(h);
    if (first && first.image !== pl.image) bad.push({ cid, rec, pl, of: first }); else seen.set(h, { ...pl, cid });
  }
  return bad;
}
const targetById = new Map(targets.map((c, n) => [s(c.id) || `c${n + 1}`, c]));
const shotOf = (cid, shotId) => (targetById.get(cid).shots || []).find((x) => s(x.id) === shotId);
for (let pass = 0; pass < 2; pass++) {
  const bad = dupes();
  if (!bad.length) break;
  for (const d of bad) {
    const c = targetById.get(d.cid), sh = shotOf(d.cid, d.pl.shot), world = styleWorldId(c), art = world ? atlasArt(world) : null, carrier = carrierOf(c).what;
    log(`${d.cid} ${d.pl.shot}: byte-identical to ${d.of.cid}/${d.of.shot}; ${pass === 0 ? "regenerating" : "marking failed"}`);
    const keep = () => { d.rec.plates = d.rec.plates.filter((x) => x !== d.pl); report.made--; };
    if (pass === 0) {
      const see = [s(sh.see), carrier && s(sh.carrier_state) ? `${carrier}: ${s(sh.carrier_state)}` : "", "No text, letters, logos or watermarks in the image."].filter(Boolean).join(" ");
      const launch = isLaunchPlate(c);
      const prompt = launch ? launchPrompt(c, sh) : art ? see : `${see} Style: ${s(c.style_world && c.style_world.description) || world || "one consistent art direction"}.`;
      const savedForce = args.force; args.force = true;
      const r = await generate(prompt, d.pl.image, art && !launch ? world : "", !launch && c.style && c.style.palette_id ? s(c.style.palette_id) : "", "");
      args.force = savedForce;
      if (!r.ok || !fs.existsSync(d.pl.image)) { try { fs.rmSync(d.pl.image, { force: true }); } catch { /* gone */ } keep(); delete sh.image; d.rec.failed.push({ shot: d.pl.shot, error: `duplicate of ${d.of.cid}/${d.of.shot} and the regeneration failed` }); report.failed++; }
    } else { try { fs.rmSync(d.pl.image, { force: true }); } catch { /* gone */ } keep(); delete sh.image; d.rec.failed.push({ shot: d.pl.shot, error: `byte-identical to ${d.of.cid}/${d.of.shot} after a regeneration: marked failed` }); report.failed++; }
  }
}
for (const bad of dupes()) { const sh = shotOf(bad.cid, bad.pl.shot); try { fs.rmSync(bad.pl.image, { force: true }); } catch { /* gone */ } bad.rec.plates = bad.rec.plates.filter((x) => x !== bad.pl); report.made--; delete sh.image; bad.rec.failed.push({ shot: bad.pl.shot, error: `byte-identical to ${bad.of.cid}/${bad.of.shot}: marked failed` }); report.failed++; }

fs.writeFileSync(file, JSON.stringify(raw, null, 2));
report.ok = report.failed === 0;
if (report.failed) report.reason = `${report.failed} plate(s) failed; those shots stay on the type template`;
writeReport();
console.log(JSON.stringify(report, null, 2));
