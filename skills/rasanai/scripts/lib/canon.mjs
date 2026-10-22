// A recurring character's identity ("canon"), shared by every medium that draws one. The ONLY link from the film to an actor is
// motion/score.json's `cast[]` (id, kind: "character", canon: <path to identity.json>, fixed: [traits]); this file validates that
// identity.json and the link. Rasan2D (stage2d.mjs) uses it for medium "painted-2d"; wave W6 reuses the same validator for the
// recurring 3D actor with medium "3d-rig": the base rules are medium-neutral and a medium adds its own rules in MEDIA below.
//
//   validateIdentity(identity, { medium, baseDir }) -> { ok, medium, errors: [{ rule, message, fix }], warnings: [...], features }
//   validateCast(score, runDir)                     -> the same shape, one row per cast member (identity + the score's link)
//   loadIdentity(file)                              -> the parsed identity (throws a readable error)
//
// Rules never accept a copied design: a name that is a known character or brand mascot is an error, and `source` must say where
// the actor came from ("original", "user-authorized" with a credit, or "generated" through art.mjs with its credit).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

// the 3D actor adapter's pure half (stage3d/character-rig.js): builders, action kinds, canonical JSON. Plain CommonJS, no browser needed.
const RIG = createRequire(import.meta.url)("../../stage3d/character-rig.js");

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const KEBAB = /^[a-z0-9][a-z0-9-]*$/;
const REMOTE = /\b(?:https?|ftp|data|javascript|blob):/i;
// names of existing characters and mascots: never a RasanAI built-in, never an unattributed actor
const COPIED = /\b(clawd|mickey|minnie|donald duck|pikachu|mario|luigi|sonic|kirby|snoopy|hello\s*kitty|winnie|pooh|peppa|bluey|spongebob|garfield|totoro|doraemon|stitch|elmo|shrek|bugs bunny|tom and jerry|pac-?man|duolingo|bluey|paddington|gruffalo|miffy|moomin)\b/i;

export const VIEWS_2D = ["front", "quarter", "side", "back-quarter", "back"];
export const SOURCES = ["original", "user-authorized", "generated"];

// what each medium needs on top of the base rules. A medium's rules get (identity, add(rule, message, fix), warn(...), ctx)
export const MEDIA = {
  "painted-2d": {
    label: "hand-painted 2D (Rasan2D)",
    paletteKeys: ["body", "outline", "accent"],
    check(id, add, warn, ctx) {
      const views = Array.isArray(id.views) ? id.views : [];
      const miss = VIEWS_2D.filter((v) => !views.includes(v));
      if (miss.length) add("views-incomplete", `painted-2d needs all five illustrated views; missing ${miss.join(", ")}`, `views: ${JSON.stringify(VIEWS_2D)}`);
      if (id.expression_preset !== "standard-31") add("expression-preset", `expression_preset must be "standard-31" (the runtime's 31 named emotions), got ${JSON.stringify(id.expression_preset)}`, 'set "expression_preset": "standard-31"');
      const p = id.proportions || {};
      if (p.leg_len != null && /short\s+legs?/i.test((id.fixed_traits || []).join(" ")) && Number(p.leg_len) > 3.4) add("trait-contradiction", `fixed trait "short legs" but proportions.leg_len is ${p.leg_len} (short is 3.4 or less)`, "shorten the legs or change the trait");
      if (/round\s+ears?/i.test((id.fixed_traits || []).join(" ")) && !(Number(p.ear_r) > 0)) add("trait-contradiction", 'fixed trait "round ears" but proportions.ear_r is missing or 0', "set proportions.ear_r > 0");
      if (ctx.traits) {
        const drawable = ctx.traits(id.fixed_traits || []);
        if (drawable.features.length < 2) add("traits-undrawable", `the runtime can draw ${drawable.features.length} of this actor's fixed traits (needs 2 or more it recognises); recognised phrases: round ears, single curved tuft, two short legs, cream belly patch, cream mittens, cream tail pom, muzzle, dorsal spots`, "word at least two fixed traits the rig draws");
        for (const u of drawable.unknown) warn("trait-not-verified", `fixed trait "${u}" is not one the runtime can verify on screen`, "keep it as a note, or add a feature the runtime draws");
      }
    },
  },
  "3d-rig": {
    label: "recurring 3D actor (Rasan3D, W6)",
    paletteKeys: ["body", "accent"],
    check(id, add, warn, ctx) {
      // fields a film's 3D scenes depend on: errors in strict mode (canon3d / the crew's check), warnings when only the shape is being validated
      const need = ctx.strict ? add : warn;
      const r = id.rig;
      if (!r || typeof r !== "object") return add("rig-missing", 'a 3d-rig actor needs a "rig" object ({ "kind": "code" | "glb", "file"? })', 'add "rig": { "kind": "code", "builder": "rasan-critter" }');
      if (!["code", "glb"].includes(r.kind)) add("rig-kind", `rig.kind must be "code" or "glb", got ${JSON.stringify(r.kind)}`, 'use "code" (built in Rasan3D) or "glb" (a local file)');
      if (r.kind === "glb") {
        if (!r.file || typeof r.file !== "string") add("rig-file", 'rig.kind "glb" needs rig.file: a project-relative path', 'add "file": "assets/models/<name>.glb"');
        else if (path.isAbsolute(r.file) || r.file.split(/[\\/]/).includes("..")) add("rig-file", "rig.file must stay inside the project (no absolute path, no ..)", "copy the model into assets/");
        warn("rig-glb-blocked", "a glb rig validates, but the adapter cannot build or animate it: skeleton clips need the rigged-actor API of the unmerged upstream Sibhimanyu/rasan-3d", 'use rig.kind "code" until it merges');
      }
      if (r.kind === "code") {
        if (!r.builder) need("rig-builder", `a code rig names its builder (have ${Object.keys(RIG.BUILDERS).join(", ")})`, '"rig": { "kind": "code", "builder": "rasan-critter" }');
        else if (!RIG.BUILDERS[r.builder]) add("rig-builder", `unknown rig.builder ${JSON.stringify(r.builder)} (have ${Object.keys(RIG.BUILDERS).join(", ")})`, "use a builder the adapter ships");
        else if (r.builder_version != null && r.builder_version !== RIG.BUILDERS[r.builder].version) add("rig-builder", `rig.builder_version ${r.builder_version} but the adapter ships ${r.builder} v${RIG.BUILDERS[r.builder].version}`, "re-seal the canon after a builder upgrade is approved");
      }
      if (id.views != null && !Array.isArray(id.views)) warn("views-shape", "views should be a list for a 3d-rig actor (camera presets) or omitted", "list the camera presets or drop the field");
      const pal = id.palette && typeof id.palette === "object" ? id.palette : {};
      // materials: one preset per palette key
      if (!id.materials || typeof id.materials !== "object" || Array.isArray(id.materials)) need("materials", 'materials is missing: one Rasan3D material preset per palette key ({ "body": "clay", ... })', '"materials": { "body": "clay", "accent": "clay" }');
      else for (const [k, v] of Object.entries(id.materials)) { if (!(k in pal)) add("materials", `materials.${k} names no palette key`, "one material per palette key"); if (typeof v !== "string" || !v.trim()) add("materials", `materials.${k} must be a material preset name`, '"clay", "matte", "plastic", "ceramic"…'); }
      // camera_reference: the standardized views the on-model check renders
      const cr = id.camera_reference;
      if (!cr || typeof cr !== "object") need("camera-reference", "camera_reference is missing: the standardized front and quarter cameras the on-model check renders", '"camera_reference": { "front": { "azimuth": 0, "elevation": 3, "lens": 70, "fill": 0.78 }, "quarter": { "azimuth": 38, ... } }');
      else for (const v of ["front", "quarter"]) {
        const c = cr[v];
        if (!c || typeof c !== "object" || !Number.isFinite(Number(c.azimuth)) || !(Number(c.lens) > 0)) need("camera-reference", `camera_reference.${v} needs a numeric azimuth (degrees) and lens (mm)`, '{ "azimuth": 0, "elevation": 3, "lens": 70, "fill": 0.78 }');
        else if (c.fill != null && !(Number(c.fill) > 0.2 && Number(c.fill) <= 1)) add("camera-reference", `camera_reference.${v}.fill must be between 0.2 and 1 (the share of the frame the actor's height fills)`, "0.78");
      }
      // attachment points: where props ride
      if (!Array.isArray(id.attachments) || !id.attachments.includes("hand_r")) need("attachments", 'attachments must list the points the rig owns, at least "hand_r" (props ride a stable hand point)', '"attachments": ["hand_r", "hand_l", "head_top"]');
      // outfit and colour swaps exist only if the identity says so; the locked palette keys (everything else) never change
      const sw = id.palette_swappable;
      if (sw != null) {
        if (!Array.isArray(sw) || sw.some((k) => !(k in pal))) add("palette-swappable", "palette_swappable must list palette keys", '"palette_swappable": ["scarf"]');
        else if (sw.includes("body") || sw.includes("accent")) add("palette-swappable", "body and accent are the actor's signature colours: never swappable", "swap an accessory colour instead");
      }
      if (id.outfits != null) {
        if (!Array.isArray(id.outfits)) add("outfits", "outfits must be a list of { id, colors }", '"outfits": [{ "id": "winter", "colors": { "scarf": "#c2453b" } }]');
        else for (const o of id.outfits) {
          if (!o || !KEBAB.test(String(o.id))) { add("outfits", `an outfit needs a kebab-case id, got ${JSON.stringify(o && o.id)}`, '"winter"'); continue; }
          for (const [k, v] of Object.entries(o.colors || {})) {
            if (!(Array.isArray(sw) && sw.includes(k))) add("outfit-locked", `outfit ${o.id} changes ${k}, which is not in palette_swappable: the canon does not permit it`, "add the key to palette_swappable only if the owner agrees");
            if (!HEX.test(String(v))) add("outfits", `outfit ${o.id}: ${k} must be a hex colour`, "#rrggbb");
          }
        }
      }
      if (Array.isArray(id.actions)) {
        const bad = id.actions.filter((a) => !RIG.KINDS.includes(a));
        if (bad.length) add("actions", `actions names kinds the adapter does not have: ${bad.join(", ")} (have ${RIG.KINDS.join(", ")})`, "use the adapter's action kinds");
        const miss = RIG.REQUIRED_ACTIONS.filter((a) => !id.actions.includes(a));
        if (miss.length) warn("actions-incomplete", `approved actions miss ${miss.join(", ")}`, "list the five reusable actions the rig can do");
      }
      for (const f of ["model_sheet", "turntable"]) if (id[f] != null) {
        if (typeof id[f] !== "string" || path.isAbsolute(id[f]) || id[f].split(/[\\/]/).includes("..")) add("reference-path", `${f} must be a path inside the run or project`, "use a relative path like cast/<id>/model-sheet.png");
        else if (ctx.baseDir && !fs.existsSync(path.resolve(ctx.baseDir, id[f]))) warn("reference-missing", `${f} ${id[f]} does not exist yet`, "render it with canon.mjs sheet, or drop the field");
      }
      // the rig asset hash: set by canon.mjs seal, so a later change to proportions, traits, materials or the rig file is a decision, not drift
      if (id.rig_hash != null) {
        let want = null;
        try { want = rigAssetHash(id, ctx.baseDir); } catch (e) { warn("rig-hash", `cannot compute the rig hash: ${e.message}`, "check the rig file path"); }
        if (want && want !== id.rig_hash) add("rig-hash-changed", `rig_hash ${String(id.rig_hash).slice(0, 12)} does not match the rig asset now (${want.slice(0, 12)}): proportions, fixed traits, materials, locked palette, attachments or the rig file changed since the canon was sealed`, "restore the canon, or re-seal it (canon.mjs seal) if the owner approved the change");
      } else warn("rig-unsealed", "rig_hash is not set: the canon is not sealed, so a changed body ratio or rig file cannot be told from the canon", "run canon.mjs seal --run <run>");
      if (ctx.traits) {
        const drawable = ctx.traits(id.fixed_traits || []);
        if (drawable.features.length < 2) add("traits-undrawable", `the rig draws ${drawable.features.length} of this actor's fixed traits (needs 2 or more it recognises); recognised: round ears, leaf sprout / curved tuft, scarf, short legs, belly patch, mittens, big eyes, blush cheeks`, "word at least two fixed traits the rig draws");
        for (const u of drawable.unknown) warn("trait-not-verified", `fixed trait "${u}" is not one the rig can verify on screen`, "keep it as a note, or add a feature the builder draws");
      }
    },
  },
};

export function loadIdentity(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { throw new Error(`cannot read identity ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new Error(`identity ${file} is not valid JSON: ${e.message}`); }
}

// opts: { medium?: force a medium, baseDir?: where a relative `reference` is looked up, traits?: (traits) -> { features, unknown },
//         traitsByMedium?: { "<medium>": traits fn } (used when the identity's own medium decides), strict?: 3d-rig fields every scene needs are errors }
export function validateIdentity(identity, opts = {}) {
  const errors = [], warnings = [];
  const add = (rule, message, fix) => errors.push({ rule, message, fix });
  const warn = (rule, message, fix) => warnings.push({ rule, message, fix });
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    add("canon-invalid", "the identity is not a JSON object", "write identity.json as an object (see stage2d/fixtures/original-actor.json)");
    return { ok: false, medium: null, errors, warnings, features: [] };
  }
  const id = identity;
  if (id.schema_version !== 1) add("schema-version", `schema_version must be 1, got ${JSON.stringify(id.schema_version)}`, '"schema_version": 1');
  if (typeof id.id !== "string" || !KEBAB.test(id.id)) add("id", `id must be kebab-case (letters, digits, dashes), got ${JSON.stringify(id.id)}`, 'e.g. "hero-01"');
  if (typeof id.display_name !== "string" || !id.display_name.trim()) add("display-name", "display_name is missing", 'e.g. "Pim"');
  const medium = opts.medium || id.medium;
  if (!MEDIA[medium]) add("medium", `medium must be one of ${Object.keys(MEDIA).join(", ")}, got ${JSON.stringify(id.medium)}`, '"medium": "painted-2d"');
  else if (opts.medium && id.medium && id.medium !== opts.medium) add("medium-mismatch", `this stage draws ${opts.medium} but the identity says ${id.medium}`, "use the stage that matches the identity's medium");
  const M = MEDIA[medium] || null;
  // palette
  const pal = id.palette;
  if (!pal || typeof pal !== "object") add("palette", "palette is missing (hex colours)", `palette: { ${(M ? M.paletteKeys : ["body", "outline", "accent"]).map((k) => `"${k}": "#rrggbb"`).join(", ")} }`);
  else {
    for (const k of M ? M.paletteKeys : ["body", "accent"]) if (!HEX.test(String(pal[k] || ""))) add("palette", `palette.${k} must be a hex colour, got ${JSON.stringify(pal[k])}`, `"${k}": "#c97057"`);
    for (const [k, v] of Object.entries(pal)) if (!HEX.test(String(v))) add("palette", `palette.${k} must be a hex colour, got ${JSON.stringify(v)}`, "use #rrggbb");
  }
  // proportions
  if (id.proportions != null) {
    if (typeof id.proportions !== "object") add("proportions", "proportions must be an object of positive numbers", '"proportions": { "body_w": 10 }');
    else for (const [k, v] of Object.entries(id.proportions)) if (!(typeof v === "number" && v > 0 && v < 100)) add("proportions", `proportions.${k} must be a positive number under 100, got ${JSON.stringify(v)}`, "use the actor's own units");
  } else add("proportions", "proportions are missing", '"proportions": { "body_w": 10, "body_h": 8, "eye_sep": 3.4 }');
  // fixed traits: the identity a recurring actor keeps in every shot (scene-contract wants 2 or more)
  if (!Array.isArray(id.fixed_traits) || id.fixed_traits.filter((t) => typeof t === "string" && t.trim()).length < 2) add("fixed-traits", "fixed_traits needs 2 or more short descriptions of what never changes (e.g. round ears, a curved tuft)", '"fixed_traits": ["round ears", "single curved tuft"]');
  // where the actor came from
  if (!SOURCES.includes(id.source)) add("source", `source must be one of ${SOURCES.join(", ")}, got ${JSON.stringify(id.source)}`, '"source": "original"');
  else if (id.source !== "original" && !(typeof id.credit === "string" && id.credit.trim().length >= 4)) add("source-credit", `source "${id.source}" needs a credit line (who made it, under what terms)`, '"credit": "Drawn by <name>, used with permission"');
  // copied designs and remote references are never accepted
  const names = [id.id, id.display_name, ...(Array.isArray(id.fixed_traits) ? id.fixed_traits : [])].filter((x) => typeof x === "string").join(" | ");
  const m = names.match(COPIED);
  if (m) add("copied-design", `the identity names an existing character or mascot ("${m[0]}"); RasanAI ships and accepts only original actors (or user-authorized ones with a credit, not named after a known character)`, "design an original actor");
  if (REMOTE.test(JSON.stringify(id))) add("remote-url", "the identity carries a remote or script URL; actors are local files only", "copy the file into the project and reference it by relative path");
  if (id.reference) {
    if (typeof id.reference !== "string" || path.isAbsolute(id.reference) || id.reference.split(/[\\/]/).includes("..")) add("reference-path", "reference must be a path inside the run or project", "use a relative path like cast/hero-01/model-sheet.png");
    else if (opts.baseDir && !fs.existsSync(path.resolve(opts.baseDir, id.reference))) warn("reference-missing", `reference ${id.reference} does not exist yet (the model sheet)`, "run stage2d.mjs sheet, or drop the field");
  }
  const traits = opts.traits || (opts.traitsByMedium && opts.traitsByMedium[medium]) || null;
  if (M) M.check(id, add, warn, { traits, baseDir: opts.baseDir, strict: !!opts.strict });
  const features = traits && Array.isArray(id.fixed_traits) ? traits(id.fixed_traits).features : [];
  return { ok: !errors.length, medium: M ? medium : null, errors, warnings, features };
}

// The score's cast list against the identity files it points at. One row per character in score.cast[].
export function validateCast(score, runDir, opts = {}) {
  const rows = [], errors = [], warnings = [];
  const cast = Array.isArray(score && score.cast) ? score.cast : [];
  for (const c of cast) {
    if (!c || c.kind !== "character") continue;
    const row = { id: c.id, canon: c.canon || null, errors: [], warnings: [] };
    const add = (rule, message, fix) => row.errors.push({ rule, message, fix });
    if (!c.canon) { add("canon-missing", `cast ${c.id} has no canon path (score.cast[].canon -> RUN/cast/${c.id}/identity.json)`, `set canon to "cast/${c.id}/identity.json"`); rows.push(row); continue; }
    const file = path.resolve(runDir, String(c.canon));
    if (!fs.existsSync(file)) { add("canon-not-found", `cast ${c.id}: ${c.canon} does not exist`, "the character designer writes it before any builder starts"); rows.push(row); continue; }
    let identity;
    try { identity = loadIdentity(file); } catch (e) { add("canon-invalid", e.message, "fix the JSON"); rows.push(row); continue; }
    const v = validateIdentity(identity, { ...opts, baseDir: path.dirname(file) });
    row.errors.push(...v.errors); row.warnings.push(...v.warnings); row.medium = v.medium;
    if (identity.id !== c.id) add("canon-id-mismatch", `score.cast id ${c.id} but ${c.canon} is for ${identity.id}`, "one id, in both places");
    const have = new Set((identity.fixed_traits || []).map((t) => String(t).toLowerCase().trim()));
    for (const t of c.fixed || []) if (!have.has(String(t).toLowerCase().trim())) add("fixed-trait-missing", `score.cast[${c.id}].fixed lists "${t}", which is not in the identity's fixed_traits`, "the score copies the identity's fixed traits, it never invents its own");
    rows.push(row);
  }
  for (const r of rows) { errors.push(...r.errors.map((e) => ({ ...e, cast: r.id }))); warnings.push(...r.warnings.map((e) => ({ ...e, cast: r.id }))); }
  return { ok: !errors.length, rows, errors, warnings, characters: rows.length };
}

// The rig asset hash of a 3D actor: what the canon fixes about the body, so a change is a decision. sha256 over the canonical JSON of the
// rig, proportions, fixed traits, materials, locked palette (every key not palette_swappable), attachments and face, plus the bytes of a glb.
export function rigAssetHash(identity, baseDir) {
  const sw = new Set(Array.isArray(identity.palette_swappable) ? identity.palette_swappable : []);
  const locked = Object.fromEntries(Object.entries(identity.palette || {}).filter(([k]) => !sw.has(k)));
  const r = identity.rig || {};
  const part = {
    kind: r.kind, builder: r.builder || null, builder_version: r.builder_version || (RIG.BUILDERS[r.builder] || {}).version || null,
    proportions: identity.proportions || {}, fixed_traits: (identity.fixed_traits || []).map((t) => String(t).toLowerCase().trim()).sort(),
    materials: identity.materials || {}, palette_locked: locked, attachments: [...(identity.attachments || [])].sort(), face: identity.face || null,
  };
  if (r.kind === "glb" && r.file) {
    const f = path.resolve(baseDir || ".", r.file);
    part.glb = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  }
  return crypto.createHash("sha256").update(RIG.canonicalJSON(part)).digest("hex");
}
export const identityDigest = (identity) => RIG.digest(identity);
export const ACTION_KINDS_3D = RIG.KINDS;

// Per-scene cast states against the canon: scene.cast_state.in/out[<id>] may carry state (where, holds, facing, action, outfit, colors)
// but never identity (palette, proportions, dropped traits). Returns one string per problem, in the scene contract's warning style.
export function castCanonWarnings(score, runDir) {
  const W = [];
  const cast = Array.isArray(score && score.cast) ? score.cast : [];
  const loaded = {};
  for (const c of cast) {
    if (!c || c.kind !== "character" || !c.canon) continue;
    const file = path.resolve(runDir, String(c.canon));
    if (!fs.existsSync(file)) continue;
    let idn;
    try { idn = loadIdentity(file); } catch (e) { W.push(`cast-canon-invalid: cast ${c.id}: ${e.message}`); continue; }
    loaded[c.id] = idn;
    const v = validateIdentity(idn, { baseDir: path.dirname(file), traitsByMedium: {} });
    for (const e of v.errors) W.push(`cast-canon-invalid: cast ${c.id} (${v.medium || idn.medium || "?"}): ${e.rule}: ${e.message}`);
    if (idn.id !== c.id) W.push(`cast-canon-invalid: cast ${c.id}: ${c.canon} is for ${idn.id}: one id, in both places`);
    const have = new Set((idn.fixed_traits || []).map((t) => String(t).toLowerCase().trim()));
    for (const t of c.fixed || []) if (!have.has(String(t).toLowerCase().trim())) W.push(`cast-canon-invalid: cast ${c.id}: score.cast.fixed lists "${t}", which is not in the identity's fixed_traits`);
  }
  const OWN = ["palette", "proportions", "silhouette", "fixed_traits", "rig", "materials", "face"];
  for (const s of Array.isArray(score && score.scenes) ? score.scenes : []) {
    for (const side of ["in", "out"]) {
      const cs = s && s.cast_state && s.cast_state[side] && typeof s.cast_state[side] === "object" ? s.cast_state[side] : {};
      for (const [id, st] of Object.entries(cs)) {
        const idn = loaded[id];
        if (!idn || !st || typeof st !== "object") continue;
        const at = `scene ${s.n} cast_state.${side}.${id}`;
        for (const k of OWN) if (st[k] != null) W.push(`cast-canon-drift: ${at} sets ${k}, which belongs to the canon (cast/${id}/identity.json), not to a scene`);
        for (const t of [].concat(st.without || st.drop || [])) if ((idn.fixed_traits || []).some((f) => String(f).toLowerCase().trim() === String(t).toLowerCase().trim())) W.push(`cast-canon-drift: ${at} drops the fixed trait "${t}"`);
        const sw = Array.isArray(idn.palette_swappable) ? idn.palette_swappable : [];
        if (st.outfit != null && !(idn.outfits || []).some((o) => o.id === st.outfit)) W.push(`cast-canon-drift: ${at} wears outfit "${st.outfit}", which the canon does not list (outfits: ${(idn.outfits || []).map((o) => o.id).join(", ") || "none"})`);
        for (const k of Object.keys(st.colors || {})) if (!sw.includes(k)) W.push(`cast-canon-drift: ${at} recolours ${k}, which the canon does not permit (palette_swappable: ${sw.join(", ") || "none"})`);
        if (st.action != null && idn.medium === "3d-rig") {
          if (!RIG.KINDS.includes(st.action)) W.push(`cast-canon-action: ${at} asks for action "${st.action}", which the rig does not have (${RIG.KINDS.join(", ")})`);
          else if (Array.isArray(idn.actions) && !idn.actions.includes(st.action)) W.push(`cast-canon-action: ${at} asks for "${st.action}", which is not among the canon's approved actions`);
        }
      }
    }
  }
  return W;
}
