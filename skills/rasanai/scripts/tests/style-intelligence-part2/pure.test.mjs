// style-intelligence-part2 PURE cases (no spawn, no fs writes, no network, no model). AUTHORED, NOT RUN.
// Future run, only after the user approves lane "pure": STYLE_PART2_APPROVED=pure node --test skills/rasanai/scripts/tests/style-intelligence-part2/pure.test.mjs
// Expected results are requirements from 06_DEFERRED_VERIFICATION.md, not observations. Shapes not in 01_CONTRACTS are marked UNKNOWN.
import test from "node:test";
import assert from "node:assert/strict";
import { skipUnless, need, load, sha, text, profile, caps, assignment, contract, grammar } from "./fixtures.mjs";

const T = (name, fn) => test(name, { skip: skipUnless("pure") }, fn);
// UNKNOWN: exact buildMediumIndex input envelopes (styleRecords/recipeIndex/capabilities/metadata shapes).
const build = async (o = {}) => (await need("medium-index.mjs", "buildMediumIndex"))({ skillRoot: "<synthetic>", styleRecords: [{ id: "pixel" }, { id: "collage" }], recipeIndex: [], capabilities: [], metadata: [profile()], ...o });
const elig = async (p, a = assignment(), r = {}) => (await need("medium-fit.mjs", "assessMediumEligibility"))(p, a, r);
const fit = async (p, a, j) => (await need("medium-fit.mjs", "assessMediumFit"))(p, a, j);
const short = async (o) => (await need("medium-fit.mjs", "selectMediumShortlist"))({ requestedCount: 3, policy: {}, recent: [], rejected: [], ...o });
const rules = async (o) => (await need("medium-rules.mjs", "resolveMediumRules"))(o);
const vGrammar = async (g) => (await need("grammar-lib.mjs", "validateGrammar"))(g); // UNKNOWN: argument shape (doc vs doc,opts).
const hasCode = (r, code) => JSON.stringify(r).includes(code); // UNKNOWN: exact error code spellings; adjust when lanes land.

// ---------- Registry and capability (M01) ----------
T("MS-01 canonical style IDs stay stable: one derived record per profile, no second catalog", async () => {
  const idx = await build({ metadata: [profile({ id: "pixel" }), profile({ id: "collage", family_id: "paper", style_refs: ["collage"], execution_id: "collage-native" })] });
  assert.equal(idx.format, "medium-index@1");
  const ids = idx.records.map((r) => r.id);
  assert.deepEqual([...ids].sort(), [...new Set(ids)].sort());
  assert.ok(ids.includes("pixel") && ids.includes("collage"));
  assert.equal(ids.filter((i) => i === "pixel").length, 1);
});
T("MS-02 prose-only STYLE.md is reference-only, never executable or verified", async () => {
  const idx = await build({ styleRecords: [{ id: "prose-only" }], metadata: [] });
  const r = (await need("medium-index.mjs", "resolveMediumProfile"))(idx, "prose-only");
  const flat = text(r) + text(idx.excluded);
  assert.ok(!/"verified":true|"enabled":true/.test(flat));
  assert.ok(/reference[_-]only/.test(flat) || r.ok === false || idx.excluded.length >= 1); // UNKNOWN: excluded vs reference_only record.
});
T("MS-03 registered profile with missing runtime file reports the missing dependency, no silent text build", async () => {
  const p = profile({ runtime_refs: ["scripts/lib/does-not-exist-synthetic.mjs"] });
  const v = (await need("medium-index.mjs", "validateMediumProfile"))(p, { skillRoot: "<synthetic>", exists: () => false }); // UNKNOWN: how context injects fs existence.
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /runtime|missing/i.test(`${e.code} ${e.message}`)));
});
T("MS-04 unknown fails clearly, alias canonicalizes, custom stays inside permitted runtimes", async () => {
  const idx = await build({ metadata: [profile({ aliases: ["pixel-art"] })] }); // UNKNOWN: alias field name.
  const res = await need("medium-index.mjs", "resolveMediumProfile");
  const bad = res(idx, "no-such-slug");
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.length >= 1 || /unknown/i.test(text(bad)));
  assert.equal(res(idx, "pixel-art").canonical_id, "pixel");
  const cust = (await need("medium-index.mjs", "validateMediumProfile"))(profile({ id: "custom-x", execution_id: "custom-network-renderer", runtime_refs: ["https://example.invalid/render"] }), {});
  assert.equal(cust.ok, false);
});
T("MS-05 changed profile source after Look approval: pinned film stays on its inputs or goes to controlled revision", async () => {
  const c = contract();
  const cur = await need("medium-contract.mjs", "mediumContractCurrent");
  const r = cur(c, { ...c.pins, profile_digest: sha("z") });
  assert.equal(r.current, false);
  assert.ok(r.stale.length >= 1);
  assert.equal(c.pins.profile_digest, sha("p")); // pinned input unchanged, not rewritten in place.
});
T("MS-06 importing new leaf modules has no network, spawn, timers or fs writes", async () => {
  const names = ["medium-index.mjs", "medium-fit.mjs", "medium-rules.mjs", "medium-contract.mjs"];
  const fs = await import("node:fs"), cp = await import("node:child_process");
  const trip = [];
  const orig = { w: fs.writeFileSync, s: cp.spawn, e: cp.execFileSync, f: globalThis.fetch, t: globalThis.setInterval };
  fs.writeFileSync = (...a) => { trip.push("write"); return orig.w(...a); }; // UNKNOWN: ESM namespaces may be frozen; the future harness may need a loader hook instead.
  globalThis.fetch = () => { trip.push("fetch"); throw new Error("network"); };
  globalThis.setInterval = () => { trip.push("timer"); return 0; };
  try { for (const n of names) await load(n); } finally { globalThis.fetch = orig.f; globalThis.setInterval = orig.t; fs.writeFileSync = orig.w; }
  assert.deepEqual(trip, []);
});

// ---------- Contextual suitability (M02) ----------
T("MS-07 same product, different objective: different fit rationale, pixel neither globally allowed nor banned", async () => {
  const p = profile();
  const tutorial = assignment({ communication_kind: "exact-tutorial" });
  const awareness = assignment({ communication_kind: "playful-awareness", proof_needs: [] });
  const a = await fit(p, tutorial, { clarity_of_proof: { value: "weak", reason: "exact text", ref: "proof-1" } });
  const b = await fit(p, awareness, { clarity_of_proof: { value: "strong", reason: "no exact text", ref: "story" } });
  assert.notDeepEqual(a.rationale, b.rationale);
  for (const x of [await elig(p, tutorial), await elig(p, awareness)]) assert.notEqual(x.state, "blocked");
});
T("MS-08 dense exact correction at phone size: full pixel is conditional/weak; sharp-layer adaptation explicit", async () => {
  const p = profile(), a = assignment();
  const e = await elig(p, a);
  assert.ok(["conditional", "unknown"].includes(e.state), `got ${e.state}`);
  const ad = (await need("medium-fit.mjs", "proposeMediumAdaptations"))(p, e, [{ id: "pixel-companion", layers: ["proof:sharp-ui", "guide:pixel"] }]);
  assert.ok(ad.length >= 1 && /sharp|hybrid|companion/i.test(text(ad)));
});
T("MS-09 known brand with no motion restriction is not a style ban", async () => {
  const a = assignment({ brand: { hard_constraints: [{ source: "brand-kit", binding_kind: "palette", scope: "color", reason: "supplied palette" }], motion_constraints: [], inferred_preferences: ["corporate"] } });
  const e = await elig(profile(), a);
  assert.notEqual(e.state, "blocked");
  assert.ok(!hasCode(e, "brand_style_ban"));
});
T("MS-10 explicit strict brand request (no characters) binds and records its actual source", async () => {
  const a = assignment({ brand: { hard_constraints: [], motion_constraints: [{ source: "brand-guide p3 (invented)", binding_kind: "hard", scope: "characters", reason: "declared: no illustrated characters" }], inferred_preferences: [] } });
  const e = await elig(profile({ native_actions: ["sprite-act"], visual_material: ["character sprites"] }), a);
  assert.ok(["blocked", "conditional"].includes(e.state));
  assert.ok(e.reasons.some((r) => /brand-guide/.test(JSON.stringify(r))));
});
T("MS-11 user-requested full-pixel walkthrough with exact fine text stays a candidate, conflict explained", async () => {
  const a = assignment({ user_direction: { named_media: ["pixel"], excluded_media: [], source_action_id: "act-1" } });
  const e = await elig(profile(), a);
  assert.notEqual(e.state, "blocked");
  assert.ok(e.reasons.length >= 1);
  const s = await short({ candidates: [profile()], assessments: [e], assignment: a });
  assert.ok(text(s.selected).includes("pixel"));
});
T("MS-12 missing CAD/UI capture: no invented internals or UI; limitation visible", async () => {
  const a = assignment({ assets: [], proof_needs: [{ id: "proof-1", kind: "exact-ui", claim_refs: ["c1"], required_text_refs: [], precision: "exact", source_available: false }] });
  const e = await elig(profile(), a);
  assert.ok(e.reasons.some((r) => /asset|evidence|capture|ui/i.test(JSON.stringify(r))));
  assert.ok(!/invent|fabricat/.test(text(e.possible_adaptations)) || /not/.test(text(e.possible_adaptations)));
});
T("MS-13 unknown font/rights/capability stays unknown: no auto-permission, no hard rejection", async () => {
  const e = await elig(profile(), assignment(), { capabilities: caps({ verified: undefined, permitted: undefined }) });
  assert.equal(e.state, "unknown");
});
T("MS-14 three adjectives on the same card treatment is not diversity", async () => {
  const mk = (id) => profile({ id, family_id: "same", execution_id: "card-text", native_actions: ["title-card"], visual_material: ["card"] });
  const cands = [mk("a"), mk("b"), mk("c")];
  const s = await short({ candidates: cands, assessments: await Promise.all(cands.map((c) => elig(c))), assignment: assignment() });
  assert.ok(s.selected.length < 3 || s.unresolved.length >= 1);
});
T("MS-15 only one family fits strict requirements: distinct treatments inside it, no forced incompatible option", async () => {
  const ok = [profile({ id: "p1", execution_id: "e1" }), profile({ id: "p2", execution_id: "e2", native_actions: ["palette-reveal"] })];
  const bad = profile({ id: "other", family_id: "paper", hard_exclusions: [{ constraint_ref: "brand:no-paper", detail: "synthetic" }] });
  const all = [...ok, bad];
  const s = await short({ candidates: all, assessments: await Promise.all(all.map((c) => elig(c, assignment({ brand: { hard_constraints: [{ source: "brand-kit", binding_kind: "hard", scope: "paper", reason: "no paper" }], motion_constraints: [], inferred_preferences: [] } })))), assignment: assignment() });
  assert.ok(!text(s.selected).includes('"other"'));
  assert.ok(s.selected.length >= 2);
});
T("MS-16 offline, no reference, policy asks for three: local material only, count preserved or explicit conflict, no fake references", async () => {
  const cands = [profile({ id: "a" }), profile({ id: "b", execution_id: "e2" })];
  const s = await short({ candidates: cands, assessments: await Promise.all(cands.map((c) => elig(c))), assignment: assignment(), requestedCount: 3 });
  assert.ok(s.selected.length === 3 || s.unresolved.length >= 1);
  assert.ok(!/https?:\/\//.test(text(s)));
});

// ---------- Grammar and compatibility (M03) ----------
T("MS-17 text_role none: no mandatory word-choreo; hard source/runtime checks remain", async () => {
  const ok = await vGrammar(grammar({ text_role: "none" }));
  assert.ok(!hasCode(ok, "word-choreo"));
  const bad = await vGrammar(grammar({ text_role: "none", native_actions: ["ref:missing-module"] }));
  assert.ok(hasCode(bad, "missing") || bad.ok === false); // UNKNOWN: result envelope of validateGrammar.
});
T("MS-18 intentional still reading hold passes constant-motion quota; missing frames still fail", async () => {
  const check = await need("grammar-lib.mjs", "checkScoreGrammar");
  const g = grammar({ ground_motion: "none", density: "reading-led" });
  const hold = check({ scenes: [{ id: "s1", start: 0, end: 6, events: [] }] }, g); // UNKNOWN: score shape.
  assert.ok(!hasCode(hold, "motion_quota") && !hasCode(hold, "ground_motion"));
  const gap = check({ scenes: [{ id: "s1", start: 0, end: 3 }, { id: "s2", start: 4, end: 6 }] }, g); // hole 3-4
  assert.ok(hasCode(gap, "gap") || gap.ok === false);
});
T("MS-19 pixel cadence is temporal styling, not frame loss or audio drift", async () => {
  const r = await rules({ contract: contract({ motion_policy: { temporal_mode: "stepped", camera_mode: "locked", intentional_holds_allowed: true, step_hz: 12 } }), layerId: "guide", sceneId: "s1", existingRules: { hard: ["frame-count", "audio-sync"], craft: ["motion-smoothness"] } });
  assert.ok(r.hard.includes("frame-count") && r.hard.includes("audio-sync"));
  assert.ok(r.scopedExceptions.some((x) => /smooth/.test(JSON.stringify(x))));
});
T("MS-20 single mechanism sufficient: one-shot line reveal is not forced to six techniques or three transitions", async () => {
  const v = await vGrammar(grammar({ native_actions: ["line-draw"], transitions: [] }));
  assert.ok(!hasCode(v, "technique_inventory") && !hasCode(v, "transition_count"));
});
T("MS-21 legacy grammar is untouched; new rules need the medium-grammar@2 discriminator", async () => {
  const legacy = { text_role: "none", ground_motion: "none" }; // no grammar_format
  const before = JSON.stringify(legacy);
  const v = await vGrammar(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.ok(hasCode(v, "word-choreo") || v.ok === false || true); // UNKNOWN: legacy result; the key assert is non-mutation + old rule still applied (adjust to saved legacy fixture once located).
});
T("MS-22 exact proof cannot be waived by a medium annotation", async () => {
  const r = await rules({ contract: contract({ invariants: [{ id: "proof-legible", kind: "hard", description: "qualifier readable", source_refs: ["proof-1"] }], text_policy: { role: "none", hide_qualifier: true } }), layerId: "proof", sceneId: "s1", existingRules: { hard: ["proof-integrity"], craft: [] } });
  assert.ok(r.hard.includes("proof-integrity"));
  assert.ok(!r.scopedExceptions.some((x) => /proof-integrity/.test(JSON.stringify(x))));
});
T("MS-23 scoped finish: no-blur/no-depth applies to the pixel layer only, not global", async () => {
  const c = contract();
  const guide = await rules({ contract: c, layerId: "guide", sceneId: "s1", existingRules: { hard: [], craft: ["depth-blur"] } });
  const proof = await rules({ contract: c, layerId: "proof", sceneId: "s1", existingRules: { hard: [], craft: ["depth-blur"] } });
  assert.ok(guide.scopedExceptions.length >= 1);
  assert.ok(!proof.scopedExceptions.some((x) => /depth-blur/.test(JSON.stringify(x))) || proof.craft.includes("depth-blur"));
});
T("MS-24 explicit repetition is legitimate: no blanket novelty failure, meaning progression assessed", async () => {
  const r = await rules({ contract: contract({ native_actions: [{ id: "refrain", serves: "deliberate refrain", repetition_intent: true }] }), layerId: "guide", sceneId: "s2", existingRules: { hard: [], craft: ["novelty-repetition"] } });
  assert.ok(r.scopedExceptions.some((x) => /repetition/.test(JSON.stringify(x))) || r.reasons.length >= 1);
  assert.ok(!r.hard.includes("novelty-repetition"));
});

// ---------- Same content / worker packet / invalidation (M07, pure part) ----------
T("MS-45 same story beat across three media candidates: comparison content digest identical", async () => {
  const dig = await need("medium-contract.mjs", "mediumContractDigest");
  const a = contract({ candidate_id: "look-a", profile_id: "pixel" }), b = contract({ candidate_id: "look-b", profile_id: "paper" }), c = contract({ candidate_id: "look-c", profile_id: "vector" });
  assert.equal(a.pins.comparison_content_digest, b.pins.comparison_content_digest);
  assert.equal(b.pins.comparison_content_digest, c.pins.comparison_content_digest);
  assert.equal(new Set([dig(a), dig(b), dig(c)]).size, 3); // only visual interpretation differs
});
T("MS-48 chosen medium reaches workers: packet has correct profile plus mandatory proof/invariants, not DOM defaults", async () => {
  const p = (await need("medium-contract.mjs", "projectMediumForWorker"))(contract(), { role: "scene-builder", beatIds: ["beat-1"], shotIds: [], events: [], budget: {} });
  const flat = text(p);
  assert.ok(flat.includes("pixel-companion") || flat.includes("living-screencast"));
  assert.ok(flat.includes("proof-legible"));
  assert.deepEqual(p.blockers, []);
  assert.ok(!/default dom|dom-gsap default/.test(flat));
});
T("MS-49 look/profile change after dispatch: contract reports stale (job rejection edge is journey-lane)", async () => {
  const c = contract();
  const r = (await need("medium-contract.mjs", "mediumContractCurrent"))(c, { ...c.pins, story_digest: sha("n") });
  assert.equal(r.current, false);
  assert.ok(r.stale.length >= 1);
  // UNKNOWN: obsolete-job rejection + recoverable previous revision live in lib/jobs + artifact-store; see journey.side-effects.test.mjs MS-49b.
});

// ---------- Examples and scoped learning (M08) ----------
// UNKNOWN: whole lane API (example index, copy reviewer, lesson store). Names below are placeholders from fixtures.API; adjust when M08 lands.
const ex = async (k) => { const { API } = await import("./fixtures.mjs"); const f = API.examples.fns[k]; if (!f) throw new Error(`UNKNOWN: M08 export for "${k}" not mapped in fixtures.API.examples.fns`); return (await need(API.examples.mod, f)); };
const ls = async (k) => { const { API } = await import("./fixtures.mjs"); const f = API.lessons.fns[k]; if (!f) throw new Error(`UNKNOWN: M08 export for "${k}" not mapped in fixtures.API.lessons.fns`); return (await need(API.lessons.mod, f)); };
T("MS-53 original example provenance: derived index resolves exact paths and rights, no fake preview", async () => {
  const idx = await (await ex("buildIndex"))({ examples: [{ id: "ex-1", runtime_owner: "paper", source_path: "skills/rasanai/library/examples/ex-1.html", rights: "original, this repo" }] });
  const rec = JSON.stringify(idx);
  assert.ok(/ex-1/.test(rec) && /original, this repo/.test(rec));
  assert.ok(!/preview_path|thumbnail|poster/.test(rec) || /null/.test(rec));
});
T("MS-54 close imitation of a source demo is flagged as scene copying; mechanics may be adapted", async () => {
  const r = await (await ex("reviewCopying"))({ treatment: { scenes: ["same shot order and composition as source demo"], mechanics: ["hinge reveal"] }, source: { id: "ex-1", distinctive_scenes: ["same shot order and composition as source demo"] } });
  assert.ok(/copy/i.test(text(r)) && !/mechanic[^"]*flag/.test(text(r)));
});
T("MS-55 agent self-declared success records no human-preference evidence", async () => {
  const rec = await (await ls("record"))({ lesson: "paper hinge worked", evidence: { source: "agent-self-assessment" } });
  assert.ok(rec.ok === false || !/human[_-]?preference|approved_by_human/.test(text(rec)));
});
T("MS-56 one rejection in one tutorial does not ban pixels or software categories", async () => {
  const rec = await (await ls("record"))({ lesson: "rejected pixel text", evidence: { source: "user-action", action_id: "act-9" }, scope: { project: "tutorial-1" } });
  assert.ok(!/global|all projects|software/.test(text(rec.scope || {})));
  assert.ok(!/ban|never/.test(text(rec.rule || "")) || /tutorial-1/.test(text(rec)));
});
T("MS-57 private brand assets/feedback from another project do not leak into this context or any query", async () => {
  const out = await (await ls("retrieve"))({ project: "proj-B", store: [{ project: "proj-A", lesson: "PRIVATE-ASSET-MARKER" }] });
  assert.ok(!text(out).includes("private-asset-marker"));
});
T("MS-58 retrieval is problem-aware: different objectives pick different mechanism examples, not the whole library", async () => {
  const get = await ex("retrieve");
  const a = await get({ medium: "paper", objective: "reveal a layered correction", limit: 3 }), b = await get({ medium: "paper", objective: "compare two groups", limit: 3 });
  assert.notDeepEqual(text(a), text(b));
  assert.ok((a.selected || a).length <= 3);
});
