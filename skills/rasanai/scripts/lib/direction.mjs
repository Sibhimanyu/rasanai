// The direction: a stack of design decisions, one or more taxonomy terms per dimension,
// compiled into DIRECTION.md, the art-direction brief Claude builds from.
// picks format: { "<dimension>": "<option>" | ["<option>", ...], "<dimension>:<facet>": "<option>" }
import { loadTaxonomy, findOption } from "./taxonomy.mjs";

// the order of the decision stack (the brief's master hierarchy)
export const STACK_ORDER = ["format", "narrative", "tone", "ui-treatment", "product-demo", "ui-interaction", "data-viz", "photo-video", "illustration", "character", "iconography", "visual-style", "era", "composition", "typography", "color", "shape", "stroke", "shadow", "material", "texture", "depth", "motion-language", "motion-function", "transitions", "camera", "effects", "pacing", "sound", "production"];
// the generic default a model reaches for unprompted: never the "you decide" answer
export const GENERIC = {
  "visual-style": ["saas-minimal", "corporate-flat", "clean-minimal", "gradient-heavy"],
  "motion-language": ["smooth"],
  transitions: ["crossfade", "fade"],
  color: ["gradient", "cool-palette"],
  composition: ["centered-hero"],
  typography: ["neutral-sans", "geometric-sans"],
  shadow: ["soft-diffuse"],
  "ui-treatment": ["floating-card-ui", "glassmorphic-ui"],
  pacing: ["medium-explanatory"],
};

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
function closest(list, id) {
  return list.map((x) => ({ x, d: lev(String(id), x) - (x.includes(id) || id.includes(x) ? 3 : 0) })).sort((p, q) => p.d - q.d).slice(0, 3).map((p) => p.x);
}

// resolve and validate picks -> { entries: [{dimension, facet?, options:[...]}], problems }
export function resolvePicks(picks) {
  const T = loadTaxonomy();
  const problems = [];
  const entries = [];
  for (const [key, raw] of Object.entries(picks || {})) {
    const [dimId, facetId] = key.split(":");
    const d = T.byId[dimId];
    if (!d) { problems.push(`unknown dimension "${dimId}"${closest(Object.keys(T.byId), dimId).length ? ` (did you mean ${closest(Object.keys(T.byId), dimId).join(", ")}?)` : ""}`); continue; }
    const vals = [].concat(raw).filter((v) => v !== null && v !== undefined && v !== "");
    if (facetId) {
      const f = (d.facets || []).find((x) => x.id === facetId);
      if (!f) { problems.push(`${dimId} has no facet "${facetId}" (facets: ${(d.facets || []).map((x) => x.id).join(", ") || "none"})`); continue; }
      const opts = [];
      for (const v of vals) {
        const o = f.options.find((x) => x.id === v);
        if (!o) problems.push(`${dimId}:${facetId} has no option "${v}" (did you mean ${closest(f.options.map((x) => x.id), v).join(", ")}?)`);
        else opts.push(o);
      }
      if (opts.length) entries.push({ dimension: d, facet: f, options: opts });
      continue;
    }
    const opts = [];
    for (const v of vals) {
      const o = d.options.find((x) => x.id === v);
      if (!o) problems.push(`${dimId} has no option "${v}" (did you mean ${closest(d.options.map((x) => x.id), v).join(", ")}?)`);
      else opts.push(o);
    }
    if (d.pick && opts.length > d.pick.max) problems.push(`${dimId} takes at most ${d.pick.max} option(s); got ${opts.length}`);
    if (opts.length) entries.push({ dimension: d, options: opts });
  }
  entries.sort((a, b) => (STACK_ORDER.indexOf(a.dimension.id) + 1 || 99) - (STACK_ORDER.indexOf(b.dimension.id) + 1 || 99) || (a.facet ? 1 : 0) - (b.facet ? 1 : 0));
  return { entries, problems };
}

const first = (entries, dim) => { const e = entries.find((x) => x.dimension.id === dim && !x.facet); return e ? e.options : []; };
const terms = (opts) => opts.map((o) => o.term).join(" + ");

// style name: VISUAL STYLE + SUBJECT/TREATMENT + MOTION/FORMAT (descriptive, no invented labels)
export function styleName(entries) {
  const vs = first(entries, "visual-style")[0];
  const tone = first(entries, "tone")[0];
  const subject = first(entries, "ui-treatment")[0] || first(entries, "illustration")[0] || first(entries, "photo-video")[0] || first(entries, "data-viz")[0];
  const typeLed = !subject && first(entries, "composition").find((o) => /typograph/i.test(o.id));
  const format = first(entries, "format")[0];
  const motion = first(entries, "motion-language")[0];
  const lower = (s) => s.replace(/\s*\(.*?\)\s*/g, " ").trim();
  // sentence-case a term but keep acronyms (UI, FUI, 3D, HUD, SaaS)
  const soft = (s) => lower(s).split(/\s+/).map((w) => (/^[A-Z0-9]{2,}$|^SaaS$|^\d/.test(w) ? w : w.toLowerCase())).join(" ");
  const parts = [vs ? lower(vs.term) + "," : tone ? lower(tone.term) + "," : null, subject ? soft(subject.term).replace(/ (ui|UI)$/, "-UI") : typeLed ? "typography-led" : null, format ? soft(format.term) : "motion piece"].filter(Boolean);
  let name = parts.join(" ");
  if (motion) name += `, ${lower(motion.term).toLowerCase()} motion`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formula(entries) {
  return entries.filter((e) => !e.facet).map((e) => `${e.dimension.name}: ${terms(e.options)}`);
}

// the compact brief paragraph: one dense instruction using the proper terms
export function promptParagraph(entries, { subject } = {}) {
  const pick = (dim) => first(entries, dim);
  const bits = [];
  const f = pick("format"), vs = pick("visual-style"), ui = pick("ui-treatment"), ill = pick("illustration"), comp = pick("composition"), ty = pick("typography"), col = pick("color"), dep = pick("depth"), ml = pick("motion-language"), tr = pick("transitions"), pa = pick("pacing"), tone = pick("tone"), nar = pick("narrative");
  bits.push(`${f.length ? `A ${terms(f).toLowerCase()}` : "A motion piece"}${subject ? ` for ${subject}` : ""}${tone.length ? `, ${terms(tone).toLowerCase()} in tone` : ""}${nar.length ? `, structured as ${terms(nar).toLowerCase()}` : ""}.`);
  const look = [vs.length && `${terms(vs)} art direction`, ui.length && `${terms(ui).toLowerCase()}`, ill.length && `${terms(ill).toLowerCase()} illustration`, comp.length && `${terms(comp).toLowerCase()} composition`, ty.length && `${terms(ty).toLowerCase()} typography`, col.length && `${terms(col).toLowerCase()} color`, dep.length && `${terms(dep).toLowerCase()} depth`].filter(Boolean);
  if (look.length) bits.push(`Look: ${look.join(", ")}.`);
  const mot = [ml.length && `${terms(ml).toLowerCase()} motion language`, tr.length && `${terms(tr).toLowerCase()} transitions`, pa.length && `${terms(pa).toLowerCase()} pacing`].filter(Boolean);
  if (mot.length) bits.push(`Motion: ${mot.join(", ")}.`);
  return bits.join(" ");
}

export function directionMd({ entries, subject, decidedBy = {}, notes = {}, brand = null, motionMd = null, avoid = [] }) {
  const name = styleName(entries);
  const byGroup = {};
  for (const e of entries) (byGroup[e.dimension.group] = byGroup[e.dimension.group] || []).push(e);
  const GROUP_NAMES = { format: "Format, purpose & tone", story: "Story, pacing & sound", subject: "Subject treatment", look: "Look", motion: "Motion" };
  const who = (id) => (decidedBy[id] === "agent" ? " *(decided by Claude)*" : decidedBy[id] === "brand" ? " *(from the brand reference)*" : "");
  const section = (e) => {
    const key = e.facet ? `${e.dimension.id}:${e.facet.id}` : e.dimension.id;
    const head = e.facet ? `#### ${e.dimension.name}: ${e.facet.name} — ${terms(e.options)}${who(key)}` : `### ${e.dimension.name} — ${terms(e.options)}${who(key)}`;
    const body = e.options.map((o) =>
      [
        `**${o.term}.** ${o.what}`,
        o.looks ? `- Looks: ${o.looks}` : null,
        o.motion ? `- Moves: ${o.motion}` : null,
        `- **Do:** ${o.prompt}`,
        o.vs ? `- **Not to be confused with:** ${o.vs}` : null,
      ].filter(Boolean).join("\n")
    );
    if (notes[key]) body.push(`- **Director's note:** ${notes[key]}`);
    return `${head}\n\n${body.join("\n\n")}`;
  };
  const groups = ["format", "story", "subject", "look", "motion"].filter((g) => byGroup[g]).map((g) => `## ${GROUP_NAMES[g]}\n\n${byGroup[g].map(section).join("\n\n")}`);
  const stack = formula(entries);
  const avoidAll = [...new Set(avoid.filter(Boolean))];
  return `# Direction: ${name}

Decided with RasanAI as a stack of design decisions, in the terms motion designers use. Claude designs and animates every frame from this brief.

## Style formula

${stack.map((s, i) => `${i ? "        ↓\n" : ""}${s}`).join("\n")}

## Brief

${promptParagraph(entries, { subject })}

## How to apply it

1. **Tokens win on values.** Colors, fonts, radii and shadows come from \`frame.md\`${brand ? ` (converted from the project's brand reference, ${brand})` : ""}; this direction says how to use them.
2. **motion.md wins on timing.** Every duration, ease, stagger and hold follows \`motion.md\`${motionMd ? ` (${motionMd})` : ""}; the motion terms below describe the character those numbers should read as. A hold is reading time and still carries secondary motion: the motion gate (no still stretch of 0.8 s, nothing creeping under 4% a second, the end card still for 1.5 s at most) wins over any hold a style or term below asks for.
3. **This direction wins on everything else:** how the product is represented, illustration, composition, texture, depth, transitions, camera, pacing.
4. **One decision per term.** Where two terms here could conflict, the one listed first in its dimension leads.
5. **GSAP plugins.** Where an instruction names SplitText, Flip, MorphSVG, DrawSVG or ScrambleText, load that plugin from the same GSAP version the composition uses (free since 3.13) and register it, or build the effect by hand (split spans, clip-path, stroke-dashoffset); never drop the technique silently.

${groups.join("\n\n")}
${avoidAll.length ? `\n## Avoid\n\n${avoidAll.map((a) => `- ${a}`).join("\n")}\n` : ""}`;
}

// candidates for a dimension the user handed to Claude ("you decide"): coherent with the
// picks so far (co-occurrence in combinations.json), away from the generic default and
// from recent picks. Returns the options ranked, with reasons.
export function suggest(dimId, picks, { recent = [], count = 3, seed = "", exclude = [] } = {}) {
  const T = loadTaxonomy();
  const d = T.byId[dimId];
  if (!d) return null;
  const chosen = new Set(Object.entries(picks || {}).flatMap(([k, v]) => [].concat(v).map((x) => `${k.split(":")[0]}/${x}`)));
  let h = 0;
  for (const ch of seed + dimId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i) => (((h ^ (i * 2654435761)) >>> 0) % 1000) / 1000;
  const scored = d.options.map((o, i) => {
    let fit = 0;
    const why = [];
    for (const c of T.combinations) {
      const inCombo = [].concat(c.stack[dimId] || []).includes(o.id);
      if (!inCombo) continue;
      const overlap = Object.entries(c.stack).flatMap(([k, v]) => [].concat(v).map((x) => `${k}/${x}`)).filter((x) => chosen.has(x)).length;
      if (overlap) { fit += overlap; why.push(c.name); }
    }
    const generic = (GENERIC[dimId] || []).includes(o.id);
    const score = fit * 2 + rnd(i) * 1.5 - (generic ? 3 : 0) - (recent.includes(o.id) ? 4 : 0);
    return { id: o.id, term: o.term, what: o.what, score: Math.round(score * 100) / 100, generic, fits: [...new Set(why)].slice(0, 3) };
  });
  scored.sort((a, b) => b.score - a.score);
  // the generic default is never a candidate; it is reported as what was passed over (the receipt)
  const passed = scored.find((x) => x.generic) || null;
  return { dimension: dimId, question: d.question, candidates: scored.filter((x) => !x.generic && !exclude.includes(x.id)).slice(0, count), passed_over: passed };
}

export function findTerm(dim, id) {
  return findOption(dim, id);
}

// complete directions for the console's Direction step: whole style combinations (combinations.json)
// ranked against the picks so far, spread so no two share a visual style, one of them unusual, never
// one built on the generic default. Each becomes a card: name, why, the terms that define it, its picks.
const CARD_DIMS = ["ui-treatment", "visual-style", "illustration", "typography", "motion-language", "transitions"];
export function directions(picks, { count = 3, exclude = [], seed = "" } = {}) {
  const T = loadTaxonomy();
  const chosen = new Set(Object.entries(picks || {}).flatMap(([k, v]) => [].concat(v).map((x) => `${k.split(":")[0]}/${x}`)));
  let h = 0;
  for (const ch of seed + "directions") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i) => (((h ^ (i * 2654435761)) >>> 0) % 1000) / 1000;
  const isGeneric = (c) => Object.entries(c.stack).some(([k, v]) => ["visual-style", "motion-language"].includes(k) && [].concat(v)[0] && (GENERIC[k] || []).includes([].concat(v)[0]));
  const scored = T.combinations
    .filter((c) => !exclude.includes(c.id))
    .map((c, i) => {
      const flat = Object.entries(c.stack).flatMap(([k, v]) => [].concat(v).map((x) => `${k}/${x}`));
      const fit = flat.filter((x) => chosen.has(x)).length;
      // a picked value the combination contradicts (another term in a single-pick dimension) counts against it
      const clash = Object.entries(picks || {}).filter(([k, v]) => !k.includes(":") && c.stack[k] && ![].concat(c.stack[k]).includes([].concat(v)[0])).length;
      return { c, fit, clash, score: fit * 2 - clash * 3 + rnd(i) * 1.2 - (isGeneric(c) ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  const out = [];
  const styles = new Set();
  const take = (x, rare) => {
    const vs = [].concat(x.c.stack["visual-style"] || [])[0] || x.c.id;
    if (styles.has(vs) || out.some((o) => o.id === x.c.id)) return false;
    styles.add(vs);
    out.push(toCard(x.c, picks, rare));
    return true;
  };
  // the best fits first, then one from the far end of the list (the one a model would rarely pick)
  for (const x of scored) { if (out.length >= Math.max(1, count - 1)) break; if (!isGeneric(x.c)) take(x, false); }
  // unusual in style, never in format: the tail only holds combinations that contradict nothing already decided
  const tail = scored.slice(Math.floor(scored.length / 3)).filter((x) => !isGeneric(x.c) && !x.clash);
  for (const x of tail.sort((a, b) => rnd(a.c.id.length) - rnd(b.c.id.length))) { if (out.length >= count) break; take(x, true); }
  for (const x of scored) { if (out.length >= count) break; take(x, false); }
  return { directions: out, recommended: out[0] ? out[0].id : null, passed_over: (scored.find((x) => isGeneric(x.c)) || {}).c?.name || null };

  function toCard(c, userPicks, rare) {
    const p = {};
    for (const [dim, v] of Object.entries(c.stack)) {
      const d = T.byId[dim];
      if (!d) continue;
      const max = (d.pick && d.pick.max) || 1;
      p[dim] = [].concat(v).filter((id) => (d.options || []).some((o) => o.id === id)).slice(0, max);
      if (!p[dim].length) delete p[dim];
    }
    // what the user already decided wins over the combination
    for (const [k, v] of Object.entries(userPicks || {})) p[k] = [].concat(v);
    const termOf = (dim) => p[dim] && T.byId[dim] ? ((T.byId[dim].options || []).find((o) => o.id === p[dim][0]) || {}).term || p[dim][0] : null;
    // the defining terms first, then enough of the rest (composition, depth, color…) to describe it in five
    const terms = CARD_DIMS.map(termOf).filter(Boolean);
    for (const dim of ["composition", "depth", "material", "color", "pacing", "camera"]) { if (terms.length >= 5) break; const t = termOf(dim); if (t && !terms.includes(t)) terms.push(t); }
    return { id: c.id, name: c.name, why: c.result, use: c.use, terms, picks: p, rare };
  }
}
