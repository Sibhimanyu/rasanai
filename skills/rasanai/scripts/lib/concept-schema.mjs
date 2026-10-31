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

// the atlas look for a style id: palette + font from the atlas file when the concept has no `style` of its own
export function atlasStyle(id) {
  const e = (atlasIndex().styles || []).find((s) => s.id === id);
  if (!e) return null;
  const f = readJ(path.join(SKILL_DIR, "library", "styles", "atlas", e.file || `${id}.json`)) || {};
  const p = f.palette || (isObj(f.colour) ? f.colour.palette : null) || e.palette || null;
  const font = (isObj(f.type) ? f.type.font || f.type.family : "") || e.font || "";
  return { palette: isObj(p) ? p : null, font: S(font) };
}
export function resolveStyle(c) {
  const id = styleWorldId(c), own = isObj(c && c.style) ? c.style : isObj(c && c.style_world) ? c.style_world : {};
  const at = (!own.palette || !own.font) && id ? atlasStyle(id) : null;
  return { id, palette: own.palette || (at && at.palette) || {}, font: S(own.font) || (at && at.font) || "" };
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
