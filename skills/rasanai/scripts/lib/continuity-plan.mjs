// Continuity ownership and the production dependency graph (V3, W06). PURE: it reads records and returns a plan; it never dispatches, spawns, writes or calls a model.
//
//   planContinuity({events, jobs, objects, assignments, anchors, links?, gates?, order?, score_digest?, continuity?}) -> {groups, dependencies, ready, cycles, ...}
//   admissionHandoff(plan, {max_concurrent, reserve_integration}) -> {batches, held}      cost/resource hand-off for W10 (data only)
//   groupOwnerFor(plan, shotOrBeatId) -> group | null                                      the one accountable owner of a shot
//   continuityGroupsForOwnership(plan) -> [{id, owner, shots, beats, events, objects}]     the shape creative-handoff.resolveOwnership({continuity}) already reads
//
// Rules (specs 08_CONTINUITY_AND_SCHEDULING):
//   - one accountable owner per CONNECTED CONTINUOUS ACTION across scenes; a scene count is never a worker count, and a graph component is not "one worker for the film"
//   - a connection is TEMPORAL only when a continuous event spans units, a temporal seam (same_object / causal_handoff / temporal_continuation) joins them, a temporal object or an
//     anchor/region shared across a boundary (typographic rule, grid cell, field) crosses them, or an explicit multi-unit assignment says so
//   - a shared STATIC asset (font, logo, palette, icon) is read concurrently by everyone and is never an edge that forces an owner: it is listed in shared_static_assets
//   - jobs: member jobs belong to the group of the units/events they build; provider jobs (asset, evidence, background) are dependencies of the groups that consume them
//   - cycles return the chain and a reason; the Director separates shared static assets from temporal dependencies or assigns the whole dependent sequence to one owner
//   - nothing is substituted: a missing asset or an unmet gate blocks exactly its dependents (ready stays empty for them), never an alternative mechanism
//
// Reuses: CONTINUITY_TYPES / seamRelation / isTemporalLink (continuity.mjs), canonicalDigest (contracts.mjs), CREATIVE_ERROR_CODES (creative-policy.mjs).
// Consumers (PROPOSED wiring, not done here): INT-ENGINE-A crew.mjs `plan` calls planContinuity on creative/brief signature_events + the storyboard + crew/jobs and writes
// crew/continuity-plan.json; the scheduler dispatches only `ready` groups, creating each group's jobs with createJob(..., {continuity:{group_id, owner, depends_on, identity_digest}});
// creative-handoff.resolveOwnership({continuity: continuityGroupsForOwnership(plan)}) hands a worker its group; INT-NATIVE replaces the "one agent per scene" prompt text.
import { canonicalDigest } from "./contracts.mjs";
import { CONTINUITY_TYPES, seamRelation, isTemporalLink } from "./continuity.mjs";
import { CREATIVE_ERROR_CODES as CODES } from "./creative-policy.mjs";

export const CONTINUITY_PLAN_VERSION = 1;
// objects of these kinds are shared read-only assets, never a temporal relationship
export const STATIC_KINDS = ["font", "logo", "palette", "brand", "icon", "texture", "static", "asset", "typeface", "color"];
// jobs of these kinds produce inputs other groups consume; they are not owners of a continuous action
export const PROVIDER_KINDS = ["asset", "evidence", "background", "font", "audio", "music", "capture", "research", "model_asset", "media"];
// an event scope that says its shots are separate instances of one idea, not one continuous action
const INDEPENDENT_SCOPES = ["independent", "refrain", "montage", "series", "parallel"];

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const S = (x) => (x == null ? "" : String(x).trim());
const ids = (x) => arr(x).map((v) => S(isObj(v) ? v.id ?? v.shot ?? v.n : v)).filter(Boolean);
const uniq = (a) => [...new Set(a)];
const natural = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const asSet = (x) => (x instanceof Set ? x : Array.isArray(x) ? new Set(x.map(S)) : isObj(x) ? new Set(Object.keys(x).filter((k) => x[k])) : new Set());

const eventUnits = (e) => ({ shots: ids(e.shot_ids || e.shots), beats: ids(e.beat_ids || e.beats) });
const unitsOf = (o) => ({ shots: ids(o && (o.shot_ids || o.shots)), beats: ids(o && (o.beat_ids || o.beats)) });
const isRequired = (e) => e.requirement === "required" || e.required === true;
const jobKey = (j) => S(j.job_id ?? j.id ?? j.node_id);
const isProvider = (j) => PROVIDER_KINDS.includes(S(j.kind).toLowerCase()) || (arr(j.produces).length > 0 && !unitsOf(j).shots.length && !unitsOf(j).beats.length && !arr(j.events).length);
const jobDone = (j) => !!j && (j.state === "completed" || j.done === true);

function normaliseAssignments(a) {
  if (Array.isArray(a)) return a.filter(isObj).map((g, i) => ({ key: S(g.key ?? g.id ?? g.name) || `assignment-${i + 1}`, owner: S(g.owner) || null, ...unitsOf(g) }));
  if (isObj(a)) return Object.entries(a).map(([k, g]) => (Array.isArray(g) ? { key: k, owner: null, shots: ids(g), beats: [] } : { key: k, owner: S(g && g.owner) || null, ...unitsOf(g) }));
  return [];
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
export function planContinuity(input = {}) {
  const { events = [], jobs = [], objects = [], assignments = [], anchors = [] } = input || {};
  const evs = arr(events).filter(isObj), jbs = arr(jobs).filter(isObj), objs = arr(objects).filter(isObj), ancs = arr(anchors).filter(isObj);
  const links = arr(input.links || (input.continuity && input.continuity.links)).filter(isObj);
  const gates = asSet(input.gates), asg = normaliseAssignments(assignments);
  const errors = [], warnings = [];
  const E = (code, ref, message, extra = {}) => errors.push({ code, ref, message, ...extra });
  const W = (code, ref, message) => warnings.push({ code, ref, message });

  // ---- units (shots and beats) and union-find ---------------------------------------------------------------------------------------------
  const kind = new Map(), parent = new Map(), why = [];
  const touch = (u, k) => { if (!u) return; if (!parent.has(u)) parent.set(u, u); if (!kind.has(u)) kind.set(u, k); };
  const find = (u) => { let r = u; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(u) !== r) { const n = parent.get(u); parent.set(u, r); u = n; } return r; };
  const join = (units, reason, ref) => {
    const u = uniq(units.filter(Boolean)); if (u.length < 2) return;
    const roots = uniq(u.map(find)); if (roots.length < 2) { why.push({ unit: u[0], reason, ref }); return; }
    for (const r of roots.slice(1)) parent.set(r, roots[0]);
    why.push({ unit: u[0], reason, ref });
  };
  const reg = ({ shots, beats }) => { shots.forEach((u) => touch(u, "shot")); beats.forEach((u) => touch(u, "beat")); return [...shots, ...beats]; };

  const evById = new Map();
  for (const e of evs) {
    const id = S(e.id); if (id) evById.set(id, e);
    const u = reg(eventUnits(e));
    const independent = e.continuous === false || INDEPENDENT_SCOPES.includes(S(e.scope).toLowerCase());
    if (!independent) join(u, "a continuous defining event spans these units", id || null);
  }
  for (const l of links) {
    const from = S(isObj(l.from) ? l.from.beat_id || l.from.scene_id || l.from.id : l.from), to = S(isObj(l.to) ? l.to.beat_id || l.to.scene_id || l.to.id : l.to);
    if (!from || !to) continue;
    if (!CONTINUITY_TYPES.includes(l.type)) { W("unknown_link_type", S(l.id) || `${from}->${to}`, `link type ${JSON.stringify(l.type)} is not a continuity type; ignored`); continue; }
    touch(from, "shot"); touch(to, "shot");
    if (isTemporalLink(l)) join([from, to], `temporal seam (${l.type}, ${seamRelation(l.type)})`, S(l.id) || `${from}->${to}`);
  }
  const objById = new Map(), staticObjs = new Map();
  for (const o of objs) {
    const id = S(o.id); if (!id) continue;
    objById.set(id, o);
    const u = reg(unitsOf(o));
    const isStatic = o.static === true || o.creates_temporal_dependency === false || STATIC_KINDS.includes(S(o.kind).toLowerCase());
    if (isStatic) staticObjs.set(id, { id, kind: o.kind || null, consumers: [], creates_temporal_dependency: false, ready: o.ready !== false });
    else if (o.temporal === true) join(u, `object ${id} is one continuous temporal identity across these units`, id);
  }
  for (const a of asg) { const u = reg(a); if (u.length > 1) join(u, `explicit assignment ${a.key} gives these units one owner`, a.key); }
  for (const a of ancs) {
    const id = S(a.id), base = unitsOf(a), pair = [S(a.from_shot ?? a.from), S(a.to_shot ?? a.to)].filter(Boolean);
    const u = reg({ shots: uniq([...base.shots, ...pair]), beats: base.beats });
    const stat = a.static === true || a.shared_only === true;
    if (stat) { if (id) staticObjs.set(id, { id, kind: a.kind || "anchor", consumers: [], creates_temporal_dependency: false, ready: true }); continue; }
    if (a.continuous !== false) join(u, `anchor/region ${id || "(unnamed)"}${a.kind ? ` (${a.kind})` : ""} crosses these units: typographic, grid or field boundary owned together`, id || null);
  }

  // ---- jobs -> units ----------------------------------------------------------------------------------------------------------------------
  const jobById = new Map(), producedBy = new Map();
  for (const j of jbs) { const k = jobKey(j); if (!k) continue; jobById.set(k, j); if (j.node_id) jobById.set(S(j.node_id), j); for (const p of ids(j.produces)) producedBy.set(p, k); }
  const jobUnits = (j) => {
    const u = unitsOf(j), out = [...u.shots, ...u.beats];
    for (const eid of ids(j.events)) { const e = evById.get(eid); if (e) out.push(...Object.values(eventUnits(e)).flat()); }
    reg(u);
    return uniq(out);
  };
  const memberJobs = [], providerJobs = [];
  for (const j of jbs) (isProvider(j) ? providerJobs : memberJobs).push(j);
  for (const j of memberJobs) jobUnits(j).forEach((u) => touch(u, kind.get(u) || "shot"));

  // ---- groups -----------------------------------------------------------------------------------------------------------------------------
  const rootsOrder = new Map();
  const ord = arr(input.order).map(S), pos = (u) => { const i = ord.indexOf(u); return i < 0 ? Infinity : i; };
  const unitSort = (a, b) => (pos(a) - pos(b)) || natural(a, b);
  const byRoot = new Map();
  for (const u of parent.keys()) { const r = find(u); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(u); }
  const groups = [];
  for (const members of byRoot.values()) {
    members.sort(unitSort);
    const shots = members.filter((u) => kind.get(u) === "shot"), beats = members.filter((u) => kind.get(u) === "beat");
    const id = "cg-" + canonicalDigest({ units: [...members].sort(natural) }).slice(0, 10);
    const g = { id, shots, beats, units: members, events: [], objects: [], anchors: [], jobs: [], owner: null, owner_source: null, reasons: [] };
    groups.push(g); for (const u of members) rootsOrder.set(u, g);
  }
  groups.sort((a, b) => unitSort(a.units[0], b.units[0]));
  const groupOf = (u) => rootsOrder.get(u) || null;
  const groupOfUnits = (us) => uniq(us.map(groupOf).filter(Boolean));

  for (const e of evs) { const gs = groupOfUnits(Object.values(eventUnits(e)).flat()); if (gs[0]) gs[0].events.push(e); }
  for (const o of objs) { const id = S(o.id); if (!id || staticObjs.has(id)) continue; const gs = groupOfUnits(Object.values(unitsOf(o)).flat()); for (const g of gs) g.objects.push(o); }
  const objectGroups = new Map();
  for (const g of groups) for (const o of g.objects) { const id = S(o.id); if (!objectGroups.has(id)) objectGroups.set(id, new Set()); objectGroups.get(id).add(g.id); }
  for (const [oid, gset] of objectGroups) if (gset.size > 1 && objById.get(oid).temporal !== false) W("object_shared_without_temporal_link", oid, `object ${oid} appears in ${gset.size} separate groups with no temporal event, seam or flag: mark it static (a shared read-only asset) or temporal (one owner), otherwise it stays a shared asset`);
  const grpIdx = new Map(groups.map((g) => [g.id, g]));
  const statConsumers = (id, g) => { const s = staticObjs.get(id); if (s && !s.consumers.includes(g.id)) s.consumers.push(g.id); };
  for (const o of objs) { const sid = S(o.id); if (staticObjs.has(sid)) for (const g of groupOfUnits(Object.values(unitsOf(o)).flat())) statConsumers(sid, g); }
  for (const a of ancs) { const sid = S(a.id); if (staticObjs.has(sid)) for (const g of groupOfUnits(Object.values(unitsOf(a)).flat())) statConsumers(sid, g); }

  // member jobs -> group
  const unplaced = [];
  for (const j of memberJobs) {
    const gs = groupOfUnits(jobUnits(j));
    if (!gs.length) { unplaced.push(jobKey(j)); continue; }
    if (gs.length > 1) W("job_spans_groups", jobKey(j), `job ${jobKey(j)} builds units from ${gs.length} independent groups; split it per group (one owner per continuous action) or mark the continuity that joins them`);
    gs[0].jobs.push(j);
  }
  const jobGroup = new Map();
  for (const g of groups) for (const j of g.jobs) jobGroup.set(jobKey(j), g.id);

  // ---- owners -----------------------------------------------------------------------------------------------------------------------------
  for (const g of groups) {
    const decl = [];
    for (const e of g.events) if (S(e.continuity_owner)) decl.push({ owner: S(e.continuity_owner), source: `event ${S(e.id)}` });
    for (const a of asg) if (a.owner && a.units === undefined && [...a.shots, ...a.beats].some((u) => groupOf(u) === g)) decl.push({ owner: a.owner, source: `assignment ${a.key}` });
    for (const o of g.objects) if (S(o.owner)) decl.push({ owner: S(o.owner), source: `object ${S(o.id)}` });
    const owners = uniq(decl.map((d) => d.owner)), req = g.events.some(isRequired);
    g.required = req; g.blocked_by = [];
    if (owners.length === 1) { g.owner = owners[0]; g.owner_source = decl[0].source; }
    else if (owners.length > 1) {
      g.owner = owners.slice().sort(natural)[0]; g.owner_source = "conflict";
      const msg = `group ${g.id} (${g.units.join(", ")}) names ${owners.length} owners (${owners.join(", ")}) for one continuous action; name exactly one accountable owner`;
      E(CODES.owner_missing, g.id, msg, { reason: "owner_conflict", repair_phase: "storyboard" }); g.blocked_by.push({ code: CODES.owner_missing, reason: "owner_conflict" });
    } else if (req) {
      g.owner = null; g.owner_source = "missing";
      E(CODES.owner_missing, g.id, `group ${g.id} (${g.units.join(", ")}) carries a required event (${g.events.filter(isRequired).map((e) => S(e.id)).join(", ")}) with no continuity_owner`, { reason: "owner_absent", repair_phase: "storyboard" });
      g.blocked_by.push({ code: CODES.owner_missing, reason: "owner_absent" });
    } else { g.owner = `owner-${g.id}`; g.owner_source = "derived"; }
  }

  // ---- dependencies -----------------------------------------------------------------------------------------------------------------------
  const dependencies = [], seen = new Set();
  const addDep = (d) => { const k = `${d.from}|${d.to}|${d.kind}|${d.ref}`; if (seen.has(k)) return; seen.add(k); dependencies.push(d); };
  const providerNode = (jid) => `job:${jid}`;
  const needsOf = (g) => uniq([...g.jobs.flatMap((j) => ids(j.depends_on)), ...g.events.flatMap((e) => ids(e.depends_on || e.requires))]);
  const groupDone = (g) => g.jobs.length > 0 && g.jobs.every(jobDone);
  const resolveRef = (ref, toNode, fromWhat) => {
    const jid = jobById.has(ref) ? jobKey(jobById.get(ref)) : producedBy.get(ref);
    if (jid) {
      const j = jobById.get(jid), fg = jobGroup.get(jid) || null, prov = !fg;
      addDep({ from: fg || providerNode(jid), to: toNode, kind: jobById.has(ref) ? "job" : "asset", ref, job_id: jid, temporal: !!fg && fg !== toNode, creates_temporal_dependency: !!fg && fg !== toNode, satisfied: jobDone(j), reason: fg && fg !== toNode ? `needs the boundary state a different owner (${fg}) produces` : prov ? `needs ${ref}, produced by provider job ${jid}` : "internal to one owner" });
      return;
    }
    if (staticObjs.has(ref)) { const s = staticObjs.get(ref); addDep({ from: `static:${ref}`, to: toNode, kind: "shared_static", ref, temporal: false, creates_temporal_dependency: false, satisfied: s.ready, reason: "shared static asset: read concurrently, not a continuity edge" }); return; }
    if (evById.has(ref)) { const fg = groupOfUnits(Object.values(eventUnits(evById.get(ref))).flat())[0]; if (fg && fg.id !== toNode) addDep({ from: fg.id, to: toNode, kind: "event", ref, temporal: true, creates_temporal_dependency: true, satisfied: groupDone(fg), reason: `needs the outcome of event ${ref} owned by ${fg.id}` }); return; }
    addDep({ from: `gate:${ref}`, to: toNode, kind: "gate", ref, temporal: false, creates_temporal_dependency: false, satisfied: gates.has(ref), reason: `gate ${ref} (${fromWhat}) must be current and approved` });
  };
  for (const g of groups) for (const ref of needsOf(g)) resolveRef(ref, g.id, "required before this group");
  for (const j of providerJobs) { const k = jobKey(j); for (const ref of ids(j.depends_on)) resolveRef(ref, providerNode(k), `needed by provider job ${k}`); }
  // a provider job feeds the groups whose units it names (a background for shot s3)
  for (const j of providerJobs) {
    const k = jobKey(j);
    for (const g of groupOfUnits(jobUnits(j))) { if (g.jobs.some((m) => ids(m.depends_on).includes(k)) || needsOf(g).some((r) => ids(j.produces).includes(r))) continue; addDep({ from: providerNode(k), to: g.id, kind: "job", ref: k, job_id: k, temporal: false, creates_temporal_dependency: false, satisfied: jobDone(j), reason: `provider job ${k} feeds units of this group` }); }
  }
  for (const g of groups) for (const d of dependencies) if (d.to === g.id && d.kind === "shared_static") statConsumers(d.ref, g);

  // ---- cycles (Tarjan over groups and provider jobs; static and gate edges cannot form a cycle) -------------------------------------------
  const nodes = new Set([...groups.map((g) => g.id), ...providerJobs.map((j) => providerNode(jobKey(j)))]);
  const adj = new Map([...nodes].map((n) => [n, []]));
  for (const d of dependencies) if (nodes.has(d.from) && nodes.has(d.to) && d.from !== d.to) adj.get(d.from).push({ to: d.to, dep: d });
  const idx = new Map(), low = new Map(), onS = new Set(), stack = [], sccs = [];
  let counter = 0;
  const strong = (v) => {
    idx.set(v, counter); low.set(v, counter); counter += 1; stack.push(v); onS.add(v);
    for (const { to } of adj.get(v)) { if (!idx.has(to)) { strong(to); low.set(v, Math.min(low.get(v), low.get(to))); } else if (onS.has(to)) low.set(v, Math.min(low.get(v), idx.get(to))); }
    if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = stack.pop(); onS.delete(w); c.push(w); } while (w !== v); if (c.length > 1) sccs.push(c); }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  const cycles = sccs.map((c) => {
    const inC = new Set(c), start = c.slice().sort(natural)[0], chain = [start];
    let cur = start; const visited = new Set([start]);
    for (;;) { const nx = adj.get(cur).find((e) => inC.has(e.to)); if (!nx) break; cur = nx.to; chain.push(cur); if (visited.has(cur)) break; visited.add(cur); }
    const edges = dependencies.filter((d) => inC.has(d.from) && inC.has(d.to));
    const staticSeparable = edges.some((d) => d.kind === "asset" || d.kind === "job");
    const message = `dependency cycle ${chain.join(" -> ")}: each needs the other's output before it can be built`;
    E(CODES.continuity_cycle, chain[0], message, { chain, repair_phase: "storyboard" });
    return { code: CODES.continuity_cycle, chain, members: c.slice().sort(natural), reason: `${message}. Separate shared static assets (a font, a logo, a palette) from temporal dependencies so they stop being edges${staticSeparable ? " (an asset edge is part of this cycle)" : ""}, or assign the whole dependent sequence to one owner; nothing is built in the meantime.`, edges: edges.map((d) => ({ from: d.from, to: d.to, kind: d.kind, ref: d.ref })) };
  });
  const cyc = new Set(cycles.flatMap((c) => c.members));

  // ---- group state, identity, readiness ---------------------------------------------------------------------------------------------------
  const ready = [], blocked = [];
  for (const g of groups) {
    const eventsMin = g.events.map((e) => ({ id: S(e.id), requirement: e.requirement || null, shots: ids(e.shot_ids || e.shots), beats: ids(e.beat_ids || e.beats), objects: ids(e.object_ids), interval_s: e.interval_s || null, digest: e.digest || null }));
    const objectsMin = g.objects.map((o) => ({ id: S(o.id), digest: o.digest || o.identity_digest || null, version: o.version ?? null, source: o.identity_source || null })).sort((a, b) => natural(a.id, b.id));
    g.identity_digest = canonicalDigest({ units: g.units, owner: g.owner, events: eventsMin.sort((a, b) => natural(a.id, b.id)), objects: objectsMin, score: input.score_digest || null });
    g.event_ids = eventsMin.map((e) => e.id).filter(Boolean);
    g.object_ids = objectsMin.map((o) => o.id);
    g.job_ids = g.jobs.map(jobKey);
    const me = why.filter((w) => g.units.includes(w.unit));
    g.reasons = uniq(me.map((w) => w.reason));
    if (!g.reasons.length) g.reasons = [g.units.length > 1 ? "joined by one continuous relationship" : "independent: no continuous relationship with another unit"];
    const deps = dependencies.filter((d) => d.to === g.id);
    g.depends_on = deps.map((d) => ({ ref: d.ref, kind: d.kind, from: d.from, satisfied: d.satisfied }));
    const unmet = deps.filter((d) => !d.satisfied);
    g.state = !g.jobs.length ? "unscheduled" : groupDone(g) ? "done" : g.jobs.some((j) => j.state === "leased" || j.state === "running") ? "active" : "pending";
    g.blocked_by.push(...unmet.map((d) => ({ code: d.kind === "gate" ? CODES.approval_missing : d.kind === "shared_static" ? CODES.capability_unavailable : CODES.stale_input, ref: d.ref, reason: d.kind === "gate" ? "gate_not_satisfied" : "dependency_not_complete" })));
    if (cyc.has(g.id)) g.blocked_by.push({ code: CODES.continuity_cycle, reason: "in_cycle" });
    g.priority = (g.required ? 1000 : 0) + g.units.length * 10 + g.events.length; // the highest-risk defining sequence goes first and is reviewed before broad dependents
    const entry = { group_id: g.id, owner: g.owner, shots: g.shots, beats: g.beats, priority: g.priority, required: g.required, reason: g.reasons[0] };
    if (!g.blocked_by.length && g.state !== "done" && g.state !== "active") ready.push(entry);
    else if (g.blocked_by.length) blocked.push({ group_id: g.id, owner: g.owner, blocked_by: g.blocked_by });
    delete g.jobs; delete g.events; delete g.objects; delete g.anchors;
  }
  ready.sort((a, b) => (b.priority - a.priority) || natural(a.group_id, b.group_id));
  for (const id of unplaced) W("job_unplaced", id, `job ${id} names no shot, beat or event; it has no continuity group and cannot be scheduled by this plan`);
  for (const g of groups) if (!g.shots.length && !g.beats.length) W("group_without_units", g.id, `group ${g.id} has no shot or beat`);

  const shared_static_assets = [...staticObjs.values()].map((s) => ({ id: s.id, kind: s.kind, consumers: s.consumers.slice().sort(natural), creates_temporal_dependency: false }));
  const plan = {
    schema_version: CONTINUITY_PLAN_VERSION, groups, dependencies, ready, cycles, blocked, shared_static_assets, errors, warnings,
    unplaced_jobs: unplaced, provider_jobs: providerJobs.map((j) => ({ job_id: jobKey(j), produces: ids(j.produces), state: j.state || null })),
    execution_authorized: false,
  };
  plan.digest = canonicalDigest({ g: groups.map((g) => [g.id, g.owner, g.identity_digest]), d: dependencies.map((d) => [d.from, d.to, d.kind, d.ref, d.satisfied]), c: cycles.map((c) => c.chain) });
  return plan;
}

// ---- hand-offs (data only; no dispatch) ---------------------------------------------------------------------------------------------------------------
export const groupOwnerFor = (plan, unit) => arr(plan && plan.groups).find((g) => g.units.includes(S(unit))) || null;

// the shape lib/creative-handoff.mjs resolveOwnership({continuity}) already accepts
export const continuityGroupsForOwnership = (plan) => arr(plan && plan.groups).map((g) => ({ id: g.id, owner: g.owner, shots: g.shots, beats: g.beats, events: g.event_ids, objects: g.object_ids }));

// W10 cost/resource admission hand-off: which ready groups may start together. Reserves capacity for integration/review, never splits a group to fill idle slots,
// and at low concurrency batches independent work in priority order instead of changing quality. `est` per group (tokens/seconds) is passed through for W10's budget reservation.
export function admissionHandoff(plan, { max_concurrent = 2, reserve_integration = 1, est = {} } = {}) {
  const cap = Math.max(1, Math.floor(Number(max_concurrent) || 1)), slots = Math.max(1, cap - Math.max(0, Math.min(reserve_integration, cap - 1)));
  const rdy = arr(plan && plan.ready);
  const batches = [];
  for (let i = 0; i < rdy.length; i += slots) batches.push(rdy.slice(i, i + slots).map((r) => ({ group_id: r.group_id, owner: r.owner, est: est[r.group_id] ?? null, op_id: `continuity:${r.group_id}`, review_first: i === 0 && r.required })));
  return { concurrent_slots: slots, reserved_for_integration: cap - slots, batches, held: arr(plan && plan.blocked).map((b) => ({ group_id: b.group_id, codes: uniq(b.blocked_by.map((x) => x.code)) })), note: "Data for W10 (reserveBudget op_id per group). The first batch's required sequence is reviewed before broad dependents start. Nothing is dispatched here." };
}
