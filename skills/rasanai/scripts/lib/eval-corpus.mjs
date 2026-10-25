// Evaluation corpus manifest checks (Plan 13 Q2, Q7). The manifest is data (tests/fixtures/plan13/corpus.json); this module validates it:
// owned or synthetic only, labelled, permission noted, expected outputs state meaning and constraints (never an exact script), held-out cases kept apart from
// anything fed to generators, and no other studio's film or paid prompt pack. It never reads private media.
import fs from "node:fs";
import path from "node:path";

export const FAMILIES = [
  "general_launch", "single_feature", "tutorial", "technical_explainer", "identity_brand", "brand_sting", "character_short", "music_lyric", "footage_reel_presenter", "hybrid_phone_ad",
  "revision_local_copy", "revision_structural_reorder", "revision_look_swap", "revision_audio_edit",
  "legacy_old_project", "adverse_missing_assets", "adverse_provider_unavailable", "adverse_restart", "adverse_stale_actions",
];
export const SOURCES = ["synthetic", "owned"]; // nothing else: no other studio's film, no paid prompt pack, no private client footage
export const SPLITS = ["example", "heldout"];
const EXACT_SCRIPT_KEYS = /^(script|exact_script|expected_script|voiceover|vo_text|exact_copy|verbatim)$/i;

export function validateCorpus(corpus = {}, { generatorExamples = [] } = {}) {
  const errors = [], warnings = [];
  const items = Array.isArray(corpus.fixtures) ? corpus.fixtures : [];
  const ids = new Set();
  for (const f of items) {
    const at = `fixture ${f.id || "?"}`;
    if (!f.id) errors.push("a fixture has no id");
    else if (ids.has(f.id)) errors.push(`${at}: duplicate id`);
    ids.add(f.id);
    if (!FAMILIES.includes(f.family)) errors.push(`${at}: unknown family ${f.family}`);
    if (!SOURCES.includes(f.source)) errors.push(`${at}: source must be ${SOURCES.join(" or ")} (never another studio's film or a paid prompt pack), got ${f.source}`);
    if (!f.label || !String(f.label).trim()) errors.push(`${at}: needs a plain label`);
    if (!f.permission_note || String(f.permission_note).trim().length < 8) errors.push(`${at}: needs a permission note`);
    if (!SPLITS.includes(f.split)) errors.push(`${at}: split must be example or heldout`);
    const exp = f.expected || {};
    if (!exp.meaning || !Array.isArray(exp.constraints) || !exp.constraints.length) errors.push(`${at}: expected output must state meaning and constraints`);
    for (const k of Object.keys(exp)) if (EXACT_SCRIPT_KEYS.test(k)) errors.push(`${at}: expected.${k} is an exact script; state meaning and constraints instead`);
    if (f.third_party_asset || /prompt.?pack|studio reel|stock footage of/i.test(JSON.stringify([f.label, f.permission_note]))) errors.push(`${at}: third-party material is not bundled`);
    if (f.split === "heldout" && generatorExamples.includes(f.id)) errors.push(`${at}: a held-out fixture is listed among generator examples`);
    if (f.split === "heldout" && !f.heldout_marker) warnings.push(`${at}: no heldout_marker, so leakage into runtime examples cannot be scanned`);
  }
  const have = new Set(items.map((f) => f.family));
  const missing = FAMILIES.filter((x) => !have.has(x));
  if (missing.length) errors.push(`missing families: ${missing.join(", ")}`);
  const held = items.filter((f) => f.split === "heldout");
  for (const need of ["unusual_brand", "valid_restrained", "hard_revision_history", "held_out_product"]) if (!held.some((f) => (f.traits || []).includes(need))) errors.push(`no held-out fixture with trait ${need}`);
  const overlap = [...new Set(items.filter((f) => f.split === "example").map((f) => f.product).filter(Boolean))].filter((p) => held.some((h) => h.product === p && (h.traits || []).includes("held_out_product")));
  if (overlap.length) errors.push(`held-out product shares a product with example fixtures: ${overlap.join(", ")}`);
  const sole = items.filter((f) => f.used_to_teach_writer && f.split !== "example");
  for (const f of sole) errors.push(`fixture ${f.id}: used to teach the writer but not marked an example`);
  return { ok: !errors.length, errors, warnings, families_covered: FAMILIES.length - missing.length, families_total: FAMILIES.length, fixtures: items.length, heldout: held.length };
}

// a fixture used to teach the writer cannot be the only generalization evaluation: every claim of generalization needs a held-out case
export function generalizationEvidence(items = [], taught = []) {
  const held = items.filter((f) => f.split === "heldout" && !taught.includes(f.id));
  return { ok: held.length >= 3, held_out_not_taught: held.map((f) => f.id), note: held.length >= 3 ? null : "generalization cannot be established from fixtures that taught the writer" };
}

// leakage scan: do held-out markers appear in files that generators read at runtime (agent briefs, references, library examples)?
export function scanLeakage(items = [], dirs = []) {
  const markers = items.filter((f) => f.split === "heldout" && f.heldout_marker).map((f) => ({ id: f.id, m: String(f.heldout_marker) }));
  const hits = [];
  const walk = (d, depth = 0) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 6 && e.name !== "node_modules" && e.name !== "fixtures") walk(p, depth + 1); continue; }
      if (!/\.(md|json|mjs|txt|html)$/i.test(e.name)) continue;
      let t; try { const st = fs.statSync(p); if (st.size > 2 * 1024 * 1024) continue; t = fs.readFileSync(p, "utf8"); } catch { continue; }
      for (const x of markers) if (t.includes(x.m)) hits.push({ fixture: x.id, file: p });
    }
  };
  for (const d of dirs) walk(d);
  return { ok: !hits.length, hits, scanned_dirs: dirs.length, markers_checked: markers.length };
}
