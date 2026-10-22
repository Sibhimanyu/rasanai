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
    check(id, add, warn) {
      const r = id.rig;
      if (!r || typeof r !== "object") return add("rig-missing", 'a 3d-rig actor needs a "rig" object ({ "kind": "code" | "glb", "file"? })', 'add "rig": { "kind": "code" }');
      if (!["code", "glb"].includes(r.kind)) add("rig-kind", `rig.kind must be "code" or "glb", got ${JSON.stringify(r.kind)}`, 'use "code" (built in Rasan3D) or "glb" (a local file)');
      if (r.kind === "glb") {
        if (!r.file || typeof r.file !== "string") add("rig-file", 'rig.kind "glb" needs rig.file: a project-relative path', 'add "file": "assets/models/<name>.glb"');
        else if (path.isAbsolute(r.file) || r.file.split(/[\\/]/).includes("..")) add("rig-file", "rig.file must stay inside the project (no absolute path, no ..)", "copy the model into assets/");
      }
      if (id.views != null && !Array.isArray(id.views)) warn("views-shape", "views should be a list for a 3d-rig actor (camera presets) or omitted", "list the camera presets or drop the field");
    },
  },
};

export function loadIdentity(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { throw new Error(`cannot read identity ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new Error(`identity ${file} is not valid JSON: ${e.message}`); }
}

// opts: { medium?: force a medium, baseDir?: where a relative `reference` is looked up, traits?: (traits) -> { features, unknown } }
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
  if (M) M.check(id, add, warn, { traits: opts.traits || null, baseDir: opts.baseDir });
  const features = opts.traits && Array.isArray(id.fixed_traits) ? opts.traits(id.fixed_traits).features : [];
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
