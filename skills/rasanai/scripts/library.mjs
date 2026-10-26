#!/usr/bin/env node
// The internal design and motion library (library/): researched references the design desk reads and cites when it
// builds a bespoke design system for a film. It is never shown to the user as a menu and never picked from directly.
//   node library.mjs index                     -> merges library/index/*.json fragments and every entry's own frontmatter
//                                                 into library/index.json (rerunnable; entries on disk win over stale fragments)
//   node library.mjs search --q "<words>" [--space 2d|3d] [--kind <kind|family|domain>] [--type systems|motion] [--limit 12]
//                                              -> ranked entries {id, type, name, kind, space, tags, good_for, path, score, why}
//   node library.mjs show <id> [--full]        -> the entry's frontmatter (tokens), its sections, its path (--full: the whole body)
//   node library.mjs ids                       -> every id (the design-system gate checks citations against it)
//   node library.mjs medium [list|show <id>|ids] [--family <id>] [--state <state>]
//                                              -> (Part 2) the DERIVED medium index (medium-index@1): families and execution profiles over library/styles/meta + the style
//                                                 references, the real runtime files and the capability registry. Read-only: it never writes library/index.json, never probes a
//                                                 host beyond the registry's file-system lookups, and never marks anything verified.
// Zero dependencies; output is JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIB = path.join(HERE, "..", "library");

// ---------------------------------------------------------------- frontmatter ("key: JSON value  # comment", one key per line)
function jsonish(v) {
  v = v.trim();
  if (!v) return "";
  try { return JSON.parse(v); } catch {}
  // a JSON value followed by a "# comment"
  const i = v.search(/\s#\s/);
  if (i > 0) { try { return JSON.parse(v.slice(0, i)); } catch {} }
  return v.replace(/^["']|["']$/g, "");
}
export function parseEntry(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const k = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
      if (k) fm[k[1]] = jsonish(k[2]);
    }
  }
  return { fm, body: m ? text.slice(m[0].length) : text };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const STOP = new Set(["and", "the", "for", "with", "never", "its", "not", "from", "that", "this", "into", "style", "era", "are"]);
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.slice(0, 5);
const arr = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const spaceOf = (fm, frag) => {
  if (frag && frag.space) return frag.space;
  const s = fm.space;
  if (typeof s === "string") return ["2d", "3d", "both"].includes(s) ? s : "both";
  if (s && typeof s === "object") {
    const three = String(s["3d"] || "");
    return three && !/^(no\b|none|n\/a|never|not )/i.test(three) ? "both" : "2d";
  }
  return "2d";
};

function readFragments() {
  const dir = path.join(LIB, "index");
  const out = { systems: new Map(), motion: new Map(), fragments: [] };
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    out.fragments.push(f);
    for (const s of j.systems || []) if (s && s.id) out.systems.set(s.id, s);
    for (const s of j.motion || []) if (s && s.id) out.motion.set(s.id, s);
  }
  return out;
}

export function buildIndex() {
  const frag = readFragments();
  const systems = [], motion = [], problems = [];
  const seen = new Set();
  for (const f of walk(path.join(LIB, "systems")).sort()) {
    const { fm } = parseEntry(fs.readFileSync(f, "utf8"));
    const rel = path.relative(LIB, f).split(path.sep).join("/");
    if (!fm.id) { problems.push(`${rel}: no id in frontmatter`); continue; }
    if (seen.has(fm.id)) { problems.push(`${rel}: duplicate id ${fm.id}`); continue; }
    seen.add(fm.id);
    const g = frag.systems.get(fm.id) || {};
    const palette = fm.palette && fm.palette.roles ? fm.palette.roles : undefined;
    const domain = g.domain || rel.split("/")[1];
    systems.push({
      id: fm.id, name: fm.name || g.name || fm.id, kind: fm.kind || g.kind || "other", domain, path: rel,
      era: fm.era || undefined, space: spaceOf(fm, g),
      tags: [...new Set([...arr(g.tags), ...words(fm.kind), ...words(fm.name)].slice(0, 24))],
      good_for: arr(g.good_for).length ? arr(g.good_for) : arr(fm.good_for),
      not_for: arr(fm.not_for), blends_with: arr(fm.blends_with), clashes_with: arr(fm.clashes_with),
      palette, motion_language: fm.motion && fm.motion.language ? fm.motion.language : undefined,
    });
  }
  for (const f of walk(path.join(LIB, "motion")).sort()) {
    const { fm } = parseEntry(fs.readFileSync(f, "utf8"));
    const rel = path.relative(LIB, f).split(path.sep).join("/");
    if (!fm.id) { problems.push(`${rel}: no id in frontmatter`); continue; }
    if (seen.has(fm.id)) { problems.push(`${rel}: duplicate id ${fm.id}`); continue; }
    seen.add(fm.id);
    const g = frag.motion.get(fm.id) || {};
    motion.push({
      id: fm.id, name: fm.name || g.name || fm.id, family: fm.family || g.family || "other", domain: rel.split("/")[1], path: rel,
      space: g.space || (["2d", "3d", "both"].includes(fm.space) ? fm.space : "both"),
      tags: [...new Set([...arr(g.tags), ...words(fm.name), ...arr(fm.references).flatMap(words)].slice(0, 24))],
      eases: fm.eases && fm.eases.key ? fm.eases.key : undefined,
      lens_mm: fm.camera && fm.camera.lens_mm ? fm.camera.lens_mm : undefined,
    });
  }
  return { generated: new Date().toISOString(), fragments: frag.fragments, systems, motion, problems };
}

export function loadIndex() {
  const f = path.join(LIB, "index.json");
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch {} }
  return buildIndex();
}

// ---------------------------------------------------------------- search
export function search(idx, { q = "", space = "", kind = "", type = "", limit = 12 } = {}) {
  const toks = [...new Set(words(q))];
  const rows = [
    ...(type === "motion" ? [] : idx.systems.map((e) => ({ ...e, type: "system" }))),
    ...(type === "systems" || type === "system" ? [] : idx.motion.map((e) => ({ ...e, type: "motion" }))),
  ];
  const out = [];
  for (const e of rows) {
    if (space === "3d" && e.space === "2d") continue;
    if (space === "2d" && e.space === "3d") continue;
    if (kind && ![e.kind, e.family, e.domain].some((x) => x && String(x).toLowerCase() === String(kind).toLowerCase())) continue;
    let score = 0;
    const why = [];
    const hit = (label, hay, w) => {
      const hw = new Set(words(Array.isArray(hay) ? hay.join(" ") : hay));
      const m = toks.filter((t) => hw.has(t) || [...hw].some((x) => x.length > 4 && t.length > 4 && stem(x) === stem(t)));
      if (m.length) { score += m.length * w; why.push(`${label}: ${m.join(", ")}`); }
    };
    if (toks.length) {
      hit("name", [e.id, e.name], 4);
      hit("good for", e.good_for || [], 3);
      hit("tags", e.tags || [], 2);
      hit("kind", [e.kind, e.family, e.domain, e.era || ""], 1.5);
    } else score = 1;
    if (score > 0) out.push({ id: e.id, type: e.type, name: e.name, kind: e.kind || e.family, space: e.space, tags: (e.tags || []).slice(0, 8), good_for: (e.good_for || []).slice(0, 3), path: `library/${e.path}`, score: Math.round(score * 10) / 10, why: why.join("; ") });
  }
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return out.slice(0, Number(limit) || 12);
}

export function show(idx, id, full) {
  const e = [...idx.systems.map((x) => ({ ...x, type: "system" })), ...idx.motion.map((x) => ({ ...x, type: "motion" }))].find((x) => x.id === id);
  if (!e) return null;
  const { fm, body } = parseEntry(fs.readFileSync(path.join(LIB, e.path), "utf8"));
  const secs = {};
  for (const part of body.split(/\n(?=## )/)) {
    const h = (part.match(/^## (.*)/) || [])[1];
    if (h) secs[h.trim()] = part.replace(/^## .*\n/, "").trim();
  }
  return { id, type: e.type, path: `library/${e.path}`, tokens: fm, sections: full ? secs : Object.fromEntries(Object.entries(secs).map(([k, v]) => [k, v.length > 900 ? v.slice(0, 900) + " …" : v])) };
}

export const libraryIds = () => {
  const i = buildIndex(); // fresh from disk: an entry added a minute ago can be cited
  return new Set([...i.systems, ...i.motion].map((e) => e.id));
};

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flag = (n) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : i >= 0 ? true : undefined; };
  const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
  if (cmd === "index") {
    const idx = buildIndex();
    fs.writeFileSync(path.join(LIB, "index.json"), JSON.stringify(idx, null, 1) + "\n");
    out({ ok: !idx.problems.length, systems: idx.systems.length, motion: idx.motion.length, fragments: idx.fragments, problems: idx.problems, index: "library/index.json" }, idx.problems.length ? 2 : 0);
  } else if (cmd === "search") {
    const idx = loadIndex();
    const hits = search(idx, { q: flag("q") === true ? "" : flag("q") || "", space: flag("space") || "", kind: flag("kind") || "", type: flag("type") || "", limit: flag("limit") || 12 });
    out({ ok: true, q: flag("q") || "", count: hits.length, total: idx.systems.length + idx.motion.length, results: hits });
  } else if (cmd === "show") {
    const id = argv[1];
    const r = id && show(loadIndex(), id, !!flag("full"));
    if (!r) out({ ok: false, error: `no library entry "${id}" (library.mjs search --q ...)` }, 1);
    out({ ok: true, ...r });
  } else if (cmd === "ids") {
    out({ ok: true, ids: [...libraryIds()].sort() });
  } else if (cmd === "medium") {
    // the request: buildMediumIndex({styleRecords: readStyleRecords(), metadata: readMediumMetadata(), recipeIndex: buildIndex(), capabilities: buildRegistry()}) (lib/medium-wiring.mjs loadMedium)
    const sub = argv[1] && !argv[1].startsWith("--") ? argv[1] : "list";
    const { loadMedium } = await import("./lib/medium-wiring.mjs");
    const { resolveMediumProfile, mediumSummary } = await import("./lib/medium-index.mjs");
    const M = loadMedium();
    const fam = flag("family") === true ? "" : flag("family") || "", st = flag("state") === true ? "" : flag("state") || "";
    if (sub === "show") {
      const r = resolveMediumProfile(M.index, argv[2]);
      if (!r.ok) out({ ok: false, error: r.message, code: r.code, missing: r.missing }, 1);
      out({ ok: true, canonical_id: r.canonical_id, aliases: r.aliases, profile: r.profile });
    } else if (sub === "ids") {
      out({ ok: true, ids: M.index.records.map((r) => r.id).sort(), families: M.index.families.map((f) => f.id).sort() });
    } else if (sub === "list") {
      const rows = M.index.records.filter((r) => (!fam || r.family_id === fam) && (!st || r.state === st)).map(mediumSummary);
      out({ ok: true, source_digest: M.index.source_digest, families: M.index.families.map((f) => ({ id: f.id, name: f.name, profile_ids: f.profile_ids, buildable: f.buildable, verified: f.verified })), profiles: rows, excluded: M.index.excluded, metadata_errors: M.metadata_errors, note: "described and implemented_unvalidated are not verified; a family with no buildable profile is inspiration only" });
    } else out({ ok: false, error: "usage: library.mjs medium [list|show <id>|ids] [--family <id>] [--state <state>]" }, 1);
  } else {
    console.error("usage: library.mjs index | search --q <words> [--space 3d] [--kind k] [--type systems|motion] | show <id> [--full] | ids | medium [list|show <id>|ids]");
    process.exit(1);
  }
}
