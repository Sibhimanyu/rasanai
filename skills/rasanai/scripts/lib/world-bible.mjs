// The world bible: one frozen file (art/world.json) that makes a film's generated pictures one world.
// An anchor image, a 30-45 word style line, character / object sheets, the palette, and for every image the shots that use it.
// The reuse gate is conditional (R6 favourites: one film has no photos, one uses ~20 stills once each in bursts, one reuses ~10 covers twice):
// hero assets (carrier, device, texture, logo, anchor) are reused 3-7 times, a still 1-3 times; zero photos is valid; 3+ uses per image is a warning;
// and no still is left static for more than ~1.2 s (an error).
// Our own code (the process is R2 of the creative-research set: one world, many framings; derivatives are free).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atlasArt } from "./concept-schema.mjs";

export const LIMITS = { images_min: 0, images_max: 6, images_burst_max: 24, uses_min: 3, style_words_min: 30, style_words_max: 45, static_max_s: 1.2, static_slack_s: 0.05, palette_min: 3, palette_max: 6 };
export const ROLES = ["anchor", "plate", "character", "object", "texture", "mockup-plate"];
export const MOVERS = ["parallax", "push", "dolly", "dissolve", "dot", "pixel", "halftone", "morph", "wipe", "mask", "pin", "mockup", "drift", "kenburns", "atmosphere", "scale-through", "layers"];
export const DERIVES = ["depth", "plates", "cutout"];

export const SCHEMA = {
  version: 1,
  name: "string: the film's world in two or three words",
  place: "string: one sentence, where this world is",
  subject: "string: one sentence, who or what is in it",
  adjectives: ["three words that feel like it"],
  style_line: "string, 30-45 words, frozen: medium, lens, light, palette in words, texture, haze, calm side, and what is never in it. Appended to every prompt (batch `style`).",
  avoid: "string: the negative line (no text, no logos, nothing looking at the camera ...)",
  style_world: "optional atlas id (library/styles/atlas): prompts are then built from its art.codex template, palette-locked and with its negatives; palette_id picks one of its 3 palettes, brand_colour_name is the brand colour as a word",
  palette_id: "optional atlas palette id (world.json carries style_world, palette_id and brand_colour_name together)",
  brand_colour_name: "optional: the brand colour as a word (\"signal orange\"), used in prompts with the locked palette",
  palette: [{ name: "clay", hex: "#c8734d" }],
  lens: "e.g. 35 mm", light: "e.g. low sun from frame left", grain: "e.g. soft 35 mm grain", calm_side: "left|right|top|bottom",
  aspect: "16:9 (the frame). Plates are asked for ~12% bleed around it for camera travel",
  bleed: 0.12,
  anchor: "image id: the master plate, approved by eye before anything else is made",
  images: [{
    id: "string", role: "anchor|plate|character|object|texture|mockup-plate", file: "art/world/<id>.png", prompt: "subject + framing; the style line is added by the batch",
    aspect: "optional", refs: ["extra reference files"], needs: ["image ids used as --ref: a character sheet"], transparent: false,
    derive: ["depth", "plates", "cutout"],
    used_by: [{ shot: "s03", start: 4.0, end: 6.4, mover: "parallax|push|dissolve|dot|pixel|halftone|morph|wipe|pin|mockup|drift|atmosphere|none", technique: "free words: what is done with it", surface: "plate|card|poster|screen|billboard" }],
    derivatives: [{ kind: "depth|plates|cutout|halftone|crop|mockup", file: "art/world/..." }],
  }],
  characters: [{ id: "string", description: "wardrobe and colour in words, never hex", sheet: "image id", views: ["front", "three-quarter", "profile"] }],
  hashes: { anchor: "sha256 of the anchor prompt + style line, set by `world lock`", style_line: "sha256" },
};

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const isHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s || ""));
export const worldPath = (run) => path.join(run, "art", "world.json");
export function loadWorld(p) {
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? worldPath(p) : p;
  let w; try { w = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { throw new Error(`cannot read the world bible ${f}: ${e.message}`); }
  if (!w || !Array.isArray(w.images)) throw new Error(`${f}: no images[]`);
  return w;
}
export const worldHashes = (w) => { const a = (w.images || []).find((i) => i.id === w.anchor); return { anchor: sha(`${a ? a.prompt : ""}|${w.style_line}`), style_line: sha(w.style_line) }; };
export const lockWorld = (w) => { w.hashes = worldHashes(w); return w; };

// a skeleton the art director fills in (the placeholders fail the check until they are real)
export function skeleton({ name = "", aspect = "16:9", shots = [] } = {}) {
  const used = (ids) => ids.map((s) => ({ shot: s, start: null, end: null, mover: null, technique: "" }));
  return {
    version: 1, name, place: "", subject: "", adjectives: [], style_line: "", avoid: "no text, no letters, no logos, no watermarks, no UI, nobody looking at the camera",
    palette: [], lens: "", light: "", grain: "", calm_side: "right", aspect, bleed: 0.12, anchor: "world-plate",
    images: [
      { id: "world-plate", role: "anchor", file: "art/world/world-plate.png", prompt: "", derive: ["depth", "plates"], used_by: used(shots.slice(0, 3)) },
      { id: "world-detail", role: "plate", file: "art/world/world-detail.png", prompt: "", derive: ["depth"], used_by: used(shots.slice(0, 3)) },
      { id: "world-surface", role: "mockup-plate", file: "art/world/world-surface.png", prompt: "", used_by: used(shots.slice(0, 3)) },
    ],
    characters: [], hashes: {},
  };
}

// ---- the gate. -> {ok, problems[], warnings[], stats}
export function checkWorld(w, { run = null, limits = {} } = {}) {
  const L = { ...LIMITS, ...limits }, problems = [], warnings = [];
  const imgs = Array.isArray(w.images) ? w.images : [];
  const sw = words(w.style_line);
  if (sw < L.style_words_min || sw > L.style_words_max) problems.push(`style-line: ${sw} words (it must be ${L.style_words_min} to ${L.style_words_max}: medium, lens, light, palette in words, texture, haze, calm side, what is never in it)`);
  if (/#[0-9a-f]{3,6}\b/i.test(w.style_line || "")) problems.push("style-line: hex codes in the style line (name colours in words)");
  if (!String(w.avoid || "").trim()) warnings.push("avoid: empty (no text, no logos, nothing looking at the camera)");
  const pal = Array.isArray(w.palette) ? w.palette : [];
  if (pal.length < L.palette_min || pal.length > L.palette_max) problems.push(`palette: ${pal.length} colours (${L.palette_min} to ${L.palette_max})`);
  for (const c of pal) if (!isHex(c && (c.hex || c))) problems.push(`palette: "${JSON.stringify(c)}" is not a #rrggbb colour`);
  if (!imgs.length) warnings.push("images: none (valid when the carrier and the UI carry the film; the style line and palette still apply)");
  if (imgs.length && imgs.length < L.images_min) problems.push(`images: ${imgs.length} generated (a world is ${L.images_min} to ${L.images_max}: one anchor and 2 to 5 more)`);
  if (imgs.length > L.images_burst_max) problems.push(`images: ${imgs.length} generated (most is ${L.images_burst_max} even for a burst film)`);
  else if (imgs.length > L.images_max) warnings.push(`images: ${imgs.length} generated (${L.images_max} is the usual: fine for a burst of 5-6 plates used once each; otherwise make a derivative (crop, grade, cutout, depth, mockup) instead of a new picture)`);
  const ids = new Set();
  const anchors = imgs.filter((i) => i.role === "anchor");
  if (imgs.length && anchors.length !== 1) problems.push(`anchor: ${anchors.length} images have role "anchor" (exactly one)`);
  if (imgs.length && !imgs.some((i) => i.id === w.anchor)) problems.push(`anchor: "${w.anchor}" is not an image id`);
  const stats = [];
  for (const im of imgs) {
    if (!im || !im.id) { problems.push("an image has no id"); continue; }
    if (ids.has(im.id)) problems.push(`image ${im.id}: duplicate id`); ids.add(im.id);
    if (!ROLES.includes(im.role)) problems.push(`image ${im.id}: role "${im.role}" is not one of ${ROLES.join(", ")}`);
    if (!im.file) problems.push(`image ${im.id}: no file`);
    if (!String(im.prompt || "").trim()) problems.push(`image ${im.id}: no prompt`);
    else if (/\b(stunning|breathtaking|8k|4k|hyper-?realistic|ultra-?detailed|masterpiece|octane|unreal engine|award-winning)\b/i.test(im.prompt)) problems.push(`image ${im.id}: the prompt has a slop word (name the lens, the light, the material instead)`);
    for (const n of im.needs || []) if (!imgs.some((o) => o.id === n)) problems.push(`image ${im.id}: needs "${n}", which is not an image`);
    for (const d of im.derive || []) if (!DERIVES.includes(d)) problems.push(`image ${im.id}: derive "${d}" is not one of ${DERIVES.join(", ")}`);
    if (run && im.file && !fs.existsSync(path.resolve(run, im.file))) warnings.push(`image ${im.id}: ${im.file} is not made yet`);
    // reuse: distinct shots that use it
    const uses = (Array.isArray(im.used_by) ? im.used_by : []).map((u) => (typeof u === "string" ? { shot: u } : u)).filter((u) => u && u.shot);
    const shots = new Set(uses.map((u) => String(u.shot)));
    if (shots.size < L.uses_min) warnings.push(`reuse: image ${im.id} is used by ${shots.size} shot(s); a hero asset (anchor, carrier, device, texture, logo) is reused ${L.uses_min}+ times (a plate, a dissolve, a card, a mockup: change the framing, not the picture); a still used once or twice is fine in a burst`);
    // no still static for more than ~1.2 s: every use that holds the picture longer than that needs a mover
    let timed = 0;
    for (const u of uses) {
      const dur = Number.isFinite(+u.end) && Number.isFinite(+u.start) && u.end != null && u.start != null ? +u.end - +u.start : null;
      const mover = u.mover == null ? "" : String(u.mover).toLowerCase();
      if (mover && mover !== "none" && mover !== "static" && !MOVERS.includes(mover)) warnings.push(`image ${im.id} in ${u.shot}: mover "${u.mover}" is not a known one (${MOVERS.join(", ")})`);
      if (dur == null) continue;
      timed++;
      if ((!mover || mover === "none" || mover === "static") && dur > L.static_max_s + L.static_slack_s) problems.push(`static-still: image ${im.id} sits still for ${dur.toFixed(1)} s in ${u.shot} (most ${L.static_max_s} s without a mover: parallax, push, dissolve, drift or atmosphere)`);
    }
    if (uses.length && !timed) warnings.push(`image ${im.id}: no start/end on its uses, so the 1.2 s still check could not run`);
    stats.push({ id: im.id, role: im.role, shots: shots.size, uses: uses.length });
  }
  for (const c of w.characters || []) if (c.sheet && !imgs.some((i) => i.id === c.sheet)) problems.push(`character ${c.id}: sheet "${c.sheet}" is not an image`);
  if (w.hashes && w.hashes.anchor) { const h = worldHashes(w); if (h.anchor !== w.hashes.anchor) warnings.push("hashes: the anchor prompt or style line changed since the world was locked: every child image is stale (regenerate them against the anchor)"); }
  return { ok: problems.length === 0, problems, warnings, stats: { images: imgs.length, style_words: sw, per_image: stats } };
}

// ---- the batch plan for imagegen.mjs: the anchor first, the sheets next (`needs`), every other image with the anchor as --ref
const ASPECTS = new Set(["16:9", "9:16", "1:1", "4:5"]);
export function batchPlan(w, run, planFile = null) {
  const bleed = Number(w.bleed) > 0 ? Math.round(Number(w.bleed) * 100) : 0;
  const rel = (f) => path.relative(planFile ? path.dirname(planFile) : run, path.resolve(run, f));
  const room = (im) => {
    const bits = [];
    if (im.role === "anchor" || im.role === "plate") {
      if (bleed) bits.push(`Compose with about ${bleed}% extra picture around the subject so the camera can travel without showing an edge`);
      if (w.calm_side) bits.push(`keep the ${w.calm_side} part of the frame calm and uncluttered for type`);
    }
    if (im.role === "mockup-plate") bits.push("A blank, flat, plain white advertising surface in the scene, completely empty and square-on enough to read its four corners, no text or pictures on it");
    if (im.role === "character") bits.push("One subject on a neutral plain ground, full figure, even light, no props");
    return bits.length ? `. ${bits.join(". ")}` : "";
  };
  return {
    aspect: w.aspect || "16:9",
    ...(w.style_world ? { style_world: w.style_world, ...(w.palette_id ? { palette: w.palette_id } : {}), ...(w.brand_colour_name ? { brand_name: w.brand_colour_name } : {}) } : {}),
    style: [w.style_line].filter(Boolean).join(" "),
    avoid: w.avoid || "",
    anchor: w.anchor,
    images: w.images.map((im) => ({
      id: im.id, prompt: `${String(im.prompt).trim().replace(/[.\s]+$/, "")}${room(im)}`, out: rel(im.file),
      ...(im.aspect ? { aspect: im.aspect } : {}), ...(im.refs && im.refs.length ? { refs: im.refs.map(rel) } : {}), ...(im.needs && im.needs.length ? { needs: im.needs } : {}),
      ...(im.transparent ? { transparent: true } : {}),
    })),
  };
}
export const aspectOk = (a) => ASPECTS.has(a) || /^\d+x\d+$/.test(String(a || ""));

// Link generated plates back into a concept's shots (shot ids are s01..., the same ids used_by[].shot carries).
// Each shot gets `image` = the first existing plate that lists it (anchor/plate roles first); a shot that already has an image is left alone unless force.
// Mutates and returns { concept, linked: [{shot, image}], unknown: [shot ids in used_by that the concept does not have] }.
export function linkShotImages(concept, world, run, { force = false } = {}) {
  const roleRank = (r) => (r === "anchor" ? 0 : r === "plate" ? 1 : 2);
  const shots = Array.isArray(concept && concept.shots) ? concept.shots : [];
  const byId = new Map(shots.map((sh, i) => [String(sh.id || `s${String(i + 1).padStart(2, "0")}`), sh]));
  const linked = [], unknown = new Set(), done = new Set();
  const imgs = [...(world.images || [])].sort((a, b) => roleRank(a.role) - roleRank(b.role));
  for (const im of imgs) {
    if (im.role === "character" || im.role === "mockup-plate" || !im.file) continue;
    const abs = path.resolve(run, im.file);
    if (!fs.existsSync(abs)) continue;
    for (const u of im.used_by || []) {
      const id = String(typeof u === "string" ? u : u && u.shot);
      const sh = byId.get(id);
      if (!sh) { unknown.add(id); continue; }
      if (done.has(id) || (sh.image && !force)) continue;
      sh.image = abs; done.add(id); linked.push({ shot: id, image: abs });
    }
  }
  return { concept, linked, unknown: [...unknown] };
}

// ---- prompt assembly from the style atlas (library/styles/atlas/<id>.json -> art.codex)
// opts: {style: atlas id, palette: palette id (default the first), subject, action, setting, see (the shot's description: used as the subject when no slots are given),
//        style_line (the world bible's frozen line), avoid (extra negatives), brand_name (a colour word for the brand slot, never hex), sprite (true for a sprite sheet)}
// -> the prompt string, or null when the style has no art block. Colours go in as WORDS from the chosen palette; the negatives are always added.
export function buildArtPrompt(o = {}) {
  const art = atlasArt(o.style);
  if (!art || !art.codex) return null;
  const pal = (art.palettes || []).find((p) => p.id === o.palette) || (art.palettes || [])[0];
  const lock = (art.brand_lock && art.brand_lock.slots) || {};
  const brandBit = o.brand_name && lock.accent && lock.accent !== "style" ? `; the hero accent colour is ${o.brand_name}` : "";
  const clean = (v) => String(v == null ? "" : v).trim().replace(/[.,;\s]+$/, "");
  const subject = clean(o.subject || o.see), action = clean(o.action), setting = clean(o.setting);
  const head = [subject, action].filter(Boolean).join(" ") + (setting ? (subject || action ? ", " : "") + setting : "");
  let p = art.codex.template.replace(/^\{subject\} \{action\}, \{setting\}\./, `${head || "a single clear subject"}.`).replace("{palette_words}", `${pal ? pal.words : "the style palette"}${brandBit}`);
  const extra = clean(o.avoid);
  if (extra) p = p.replace(/\.$/, `, ${extra}.`);
  if (o.sprite && art.codex.sprite_sheet && art.codex.sprite_sheet.use) p += ` ${art.codex.sprite_sheet.rules}`;
  if (o.style_line) p += ` World style (every image of this film): ${clean(o.style_line)}.`;
  return p;
}
export const artAspect = (style, role) => { const a = atlasArt(style); return a && (role === "sprite" || role === "character" || role === "object") ? a.codex.aspect.sprite : null; };
