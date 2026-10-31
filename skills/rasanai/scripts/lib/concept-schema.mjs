// The ONE concept schema (references/concept-schema.md). Every reader (story.mjs GV, treatment.mjs, board.mjs, style-frames.mjs,
// story-visuals.mjs, moves.mjs validate-score, grammar.mjs) and writer (concept-writer-*, script-writer, imagegen) goes through here.
//   style_world: an atlas id string; optional `style` {palette{bg,bg2,ink,accent}, font}, resolved from the atlas when missing.
//   carrier {what, kind}; signature_moment {what, shot}; sound_mode; shots[] {id s01.., t, see, style, carrier_state, move, transition, words, image?}
// Older spellings still read: style_world as an object {name|id, palette, font}, carrier / signature_moment as plain strings.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const CARRIER_KINDS = ["dot", "word-line", "icon-set", "palette-dither", "card-field", "ui-plane", "ui-object", "object", "mark"];
// ui-object: ONE product UI element (a pill, an app-icon stack with rising notification counters, a card that morphs through 6 states) is the carrier AND the protagonist (R6)
export const SOUND_MODES = ["vo-kinetic", "instrumental-arc", "sfx-led", "song-lyric"];
export const SHOT_ID_RE = /^s\d{2,3}$/;
const S = (v) => (v == null ? "" : String(v).trim());
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
let _moves, _atlas;
export const moveIndex = () => (_moves ||= (readJ(path.join(SKILL_DIR, "library", "moves", "index.json")) || { moves: [] }));
export const atlasIndex = () => (_atlas ||= (readJ(path.join(SKILL_DIR, "library", "styles", "atlas", "index.json")) || { styles: [] }));
export const moveIds = () => new Set([...(moveIndex().moves || []).map((m) => m.id), ...(((readJ(path.join(SKILL_DIR, "library", "moves", "library.json")) || {}).moves) || []).map((m) => m && m.id)].filter(Boolean));
export const atlasIds = () => new Set((atlasIndex().styles || []).map((s) => s.id));

export const styleWorldId = (c) => { const sw = c && c.style_world; return S(isObj(sw) ? sw.id || sw.name : sw); };
export const carrierOf = (c) => { const k = c && c.carrier; return isObj(k) ? { what: S(k.what || k.name), kind: S(k.kind) } : { what: S(k), kind: "" }; };
export const signatureOf = (c) => { const k = c && c.signature_moment; return isObj(k) ? { what: S(k.what || k.see), shot: S(k.shot || k.id) } : { what: S(k), shot: "" }; };
export const moveIdOf = (sh) => S(isObj(sh && sh.move) ? sh.move.id : sh && sh.move);
export const soundModeOf = (c) => { const m = S(c && c.sound_mode); return m === "vo-led" ? "vo-kinetic" : m; };

// The atlas art block for a style id (library/styles/atlas/<id>.json -> art): palettes, type pairings, finish, composition, codex image direction.
const _art = {};
export function atlasArt(id) {
  if (!id) return null;
  if (id in _art) return _art[id];
  const e = (atlasIndex().styles || []).find((s) => s.id === id);
  const f = e ? readJ(path.join(SKILL_DIR, "library", "styles", "atlas", e.file || `${id}.json`)) : null;
  return (_art[id] = (f && isObj(f.art) ? f.art : null));
}
const HEX6 = /^#[0-9a-f]{6}$/i;
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mixHex = (a, b, t) => (HEX6.test(a) && HEX6.test(b) ? toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t)) : a);
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { if (!HEX6.test(a) || !HEX6.test(b)) return 21; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const brandOf = (c) => { const b = c && isObj(c.brand) ? c.brand : {}; const v = S((c && c.brand_colour) || (isObj(c && c.style) && c.style.brand_colour) || b.colour || b.color || b.accent || b.primary); return HEX6.test(v) ? v : ""; };

// the palette of an atlas style: palette id (concept.style.palette_id / palette_id) or the first one; the brand colour fills the slots the style's brand_lock marks "brand"
export function paletteOf(art, paletteId, brand = "") {
  const pals = (art && art.palettes) || [];
  const p = pals.find((x) => x.id === paletteId) || pals[0];
  if (!p) return null;
  const out = { ...p }, slots = (art.brand_lock && art.brand_lock.slots) || {};
  if (brand) {
    const other = { bg: p.ink, bg2: p.ink, ink: p.bg, accent: p.bg, accent2: p.bg };
    for (const k of ["bg", "bg2", "ink", "accent", "accent2"]) {
      const m = slots[k];
      if (m === "brand" || (m === "brand-or-style" && contrast(brand, other[k]) >= 4.5)) out[k] = brand;
    }
  }
  out.muted = mixHex(out.ink, out.bg, 0.45);
  return out;
}
export function pairingOf(art, pairingId) {
  const ps = (art && art.type && art.type.pairings) || [];
  return ps.find((x) => x.id === pairingId) || ps.find((x) => x.id === (art.type || {}).default) || ps[0] || null;
}

// the atlas look for a style id: palette + font from the atlas file when the concept has no `style` of its own
export function atlasStyle(id, o = {}) {
  const e = (atlasIndex().styles || []).find((s) => s.id === id);
  if (!e) return null;
  const art = atlasArt(id);
  if (art) {
    const pal = paletteOf(art, o.palette_id, o.brand), pr = pairingOf(art, o.pairing_id);
    return { palette: pal, font: pr ? pr.css.display : "", text_font: pr ? pr.css.text : "", pairing: pr, art };
  }
  const f = readJ(path.join(SKILL_DIR, "library", "styles", "atlas", e.file || `${id}.json`)) || {};
  const p = f.palette || (isObj(f.colour) ? f.colour.palette : null) || e.palette || null;
  const font = (isObj(f.type) ? f.type.font || f.type.family : "") || e.font || "";
  return { palette: isObj(p) ? p : null, font: S(font) };
}
// -> { id, palette{bg,bg2,ink,accent,accent2,muted}, font, text_font, pairing, art }. The concept's own style {palette, font, palette_id, pairing_id} wins slot by slot; the atlas fills the rest.
export function resolveStyle(c) {
  const id = styleWorldId(c), own = isObj(c && c.style) ? c.style : isObj(c && c.style_world) ? c.style_world : {};
  const at = id ? atlasStyle(id, { palette_id: S(own.palette_id || (c && c.palette_id)), pairing_id: S(own.pairing_id), brand: brandOf(c) }) : null;
  const palette = { ...((at && at.palette) || {}), ...(isObj(own.palette) ? own.palette : {}) };
  if (isObj(own.palette) && !own.palette.muted) palette.muted = mixHex(palette.ink || "#16181D", palette.bg || "#F4F1EA", 0.45);
  return { id, palette, font: S(own.font) || (at && at.font) || "", text_font: (at && at.text_font) || "", pairing: (at && at.pairing) || null, art: (at && at.art) || null };
}

// -> { errors: [], warnings: [] }; never throws. opts.shots=false skips the shot-list rules.
export function lintConcept(c, opts = {}) {
  const errors = [], warnings = [];
  if (!isObj(c)) return { errors: ["concept is not an object"], warnings };
  const id = styleWorldId(c);
  if (!id) errors.push("style_world missing (an atlas id, library/styles/atlas/index.json)");
  else if (atlasIndex().styles.length && !atlasIds().has(id)) warnings.push(`style_world "${id}" is not in library/styles/atlas/index.json (known: ${[...atlasIds()].slice(0, 6).join(", ")}...)`);
  const car = carrierOf(c);
  if (!car.what) errors.push("carrier.what missing");
  if (car.kind && !CARRIER_KINDS.includes(car.kind)) warnings.push(`carrier.kind "${car.kind}" is not one of ${CARRIER_KINDS.join(", ")}`);
  if (!car.kind) warnings.push(`carrier.kind missing (one of ${CARRIER_KINDS.join(", ")})`);
  const sm = soundModeOf(c);
  if (sm && !SOUND_MODES.includes(sm)) errors.push(`sound_mode "${sm}" is not one of ${SOUND_MODES.join(", ")}`);
  if (opts.shots === false) return { errors, warnings };
  const shots = Array.isArray(c.shots) ? c.shots : [], ids = new Set(), mids = moveIds();
  shots.forEach((sh, i) => {
    const at = `shots[${i}]`;
    if (!isObj(sh)) return;
    const sid = S(sh.id);
    if (!sid) warnings.push(`${at}.id missing (s01 format)`);
    else if (!SHOT_ID_RE.test(sid)) warnings.push(`${at}.id "${sid}" is not in the s01 format`);
    else if (ids.has(sid)) errors.push(`${at}.id "${sid}" is used twice`);
    ids.add(sid);
    const m = moveIdOf(sh);
    if (m && mids.size && !mids.has(m)) warnings.push(`${at}.move "${m}" is not a move id (library/moves/index.json)`);
  });
  const sig = signatureOf(c);
  if (sig.shot && !ids.has(sig.shot)) warnings.push(`signature_moment.shot "${sig.shot}" is not a shot id`);
  return { errors, warnings };
}
// fill missing shot ids (s01...) in place; returns the concept
export function ensureShotIds(c) {
  if (c && Array.isArray(c.shots)) c.shots.forEach((sh, i) => { if (isObj(sh) && !S(sh.id)) sh.id = `s${String(i + 1).padStart(2, "0")}`; });
  return c;
}
