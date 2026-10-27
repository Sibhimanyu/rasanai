// The one stage registry: six logical stages over the 24 legacy step keys (console.mjs STEPS).
// stages.json is the shared table (Swift and other tools read the same file); this is the JS view of it.
// Additive: legacy step keys stay what sessions and actions.jsonl store; nothing is rewritten.
import fs from "node:fs";

const TABLE = JSON.parse(fs.readFileSync(new URL("./stages.json", import.meta.url), "utf8"));

export const STAGES = Object.freeze([...TABLE.order]);
export const STAGE_TABLE = TABLE.stages;
export const TRANSPORT_ALIASES = TABLE.transport_aliases;

const byKey = new Map();
for (const s of STAGES) for (const k of TABLE.stages[s].legacy) byKey.set(k, s);
for (const [k, s] of Object.entries(TABLE.transport_aliases)) if (!byKey.has(k)) byKey.set(k, s);

// unknown or non-string key -> null, never throws; a logical stage name maps to itself
export function logicalStage(key) {
  if (typeof key !== "string") return null;
  if (STAGES.includes(key)) return key;
  return byKey.get(key) || null;
}

export const legacyKeys = (stage) => (TABLE.stages[stage] ? [...TABLE.stages[stage].legacy] : []);

export const dependsOn = (stage) => (TABLE.stages[stage] ? [...TABLE.stages[stage].depends_on] : []);

// every stage that (transitively) depends on `stage`, in dependency order
export function descendants(stage) {
  if (!TABLE.stages[stage]) return [];
  const out = new Set();
  for (const s of STAGES) {
    if (TABLE.stages[s].depends_on.some((d) => d === stage || out.has(d))) out.add(s);
  }
  return STAGES.filter((s) => out.has(s));
}

// Plan 04 L1: every stage upstream of `stage`, in dependency order (brief, story, look for storyboard).
export function ancestors(stage) {
  if (!TABLE.stages[stage]) return [];
  const seen = new Set();
  const walk = (s) => { for (const d of TABLE.stages[s].depends_on) { if (!seen.has(d)) { seen.add(d); walk(d); } } };
  walk(stage);
  return STAGES.filter((s) => seen.has(s));
}

// Which upstream stages are not yet committed? `committed` is a list/Set of logical stage names.
// A key (legacy or logical) that maps to no stage is never blocked. Storyboard work needs a committed Look; a Look comparison does not.
export function missingPrerequisites(keyOrStage, committed = []) {
  const st = logicalStage(keyOrStage);
  if (!st) return [];
  const have = new Set(committed);
  return ancestors(st).filter((s) => !have.has(s));
}
