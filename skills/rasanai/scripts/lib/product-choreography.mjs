// Product choreography (SQ-PRODUCT, ledger 6.4): plans how a product behavior is SHOWN, bound to approved source states.
//
//   planChoreography(beat, { captures, claims, rights, anchors, score, now, claimsPolicy }) -> { ok, blocked, blocks, errors, warnings, stages, intermediates,
//        required_labels, conditions, simplifications, reading, record, runtime, digest }
//   readingSeconds(content, { newContext, isolate })   checkStudioCapture(capture)   STAGE_PLAN_BY_KIND   ALLOWED_SIMPLIFICATIONS   FORBIDDEN_SIMPLIFICATIONS   STUDIO_UI
//
// Stages (context -> action -> result -> isolate -> hold): only the ones the claim needs. Every stage is bound to an approved capture state
// (research/screens.json entry) or to clearly labelled demonstration content. A missing, outdated, rights-withdrawn or wrong-UI capture returns
// `blocked` with the capture id: never a silent substitute. Nothing here fabricates functionality, customer messages, metrics or social proof.
//
// Reuses: sequence-contract.normalizeProduct (record shape and the PRODUCT_STAGES/error-code tables), provenance.stampClaim/carryCheck/mediaAuthority
// (claims ledger and exact-asset authority), composition-anchors ids (anchors come from planAnchors output; an anchor id that does not resolve is an error).
// Time: score seconds only (no fps). Reading durations follow content and context (no universal hold) and are floors, never comprehension checks.
//
// Consumers: producer = Storyboard/Motion Director plan step; artifact = the `product` key of creative/beat-plans.json (`record`) and the `runtime` op list;
// consumers = packets.writeScenePlans / beatDeclarations / beatPlanNeeds (PROPOSED for ENG-INT-1, see references/product-choreography.md) and the scene
// page, which maps `runtime` ops onto RasanUI (runtime/rasan-ui.js: reveal / isolate / follow / hold). Not wired from source by this lane.
import { canonicalDigest } from "./contracts.mjs";
import { stampClaim, carryCheck, mediaAuthority, RIGHTS_STATUS } from "./provenance.mjs";
import { normalizeProduct, PRODUCT_STAGES, SEQUENCE_ERROR_CODES as K } from "./sequence-contract.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const S = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : null);
const r3 = (v) => Math.round(v * 1000) / 1000;
const words = (t) => S(t).split(/\s+/).filter(Boolean).length;

// ---- the Studio rule ------------------------------------------------------------------------------------------------------------------------
export const STUDIO_UI = Object.freeze({
  ui: "dark-sidebar-dot-stepper",
  stepper: Object.freeze(["Describe", "Setup", "Brief", "Story", "Look", "Preview", "Final"]),
  retired_terms: Object.freeze(["Animatic", "Watch the first cut", "review the animatic", "Apply N notes"]),
  retired_paths: /(^|[\\/])(archive[\\/]old-ui|OLD-do-not-use)/i,
  reference: "docs/brand/studio-ui/README.md",
});
const isStudioName = (n) => /\brasan\s*ai\b|\brasanai\b|\brasa\s*director\b/i.test(S(n));

// A capture of Studio must be the current dark UI. Rejects a retired light UI by flag, path or content; asks for an explicit `ui:"dark"` otherwise.
export function checkStudioCapture(c) {
  const out = [];
  const cap = isObj(c) ? c : {};
  const text = [cap.shows, cap.path, cap.label].map(S).join(" ");
  const ui = S(cap.ui).toLowerCase();
  if (ui === "light" || cap.retired_ui === true || cap.ui_generation === "retired" || STUDIO_UI.retired_paths.test(S(cap.path))) out.push({ code: K.studio_ui, message: `capture ${S(cap.id) || "?"} is the retired light Studio UI: never use it (${STUDIO_UI.reference})` });
  else if (STUDIO_UI.retired_terms.some((t) => text.toLowerCase().includes(t.toLowerCase()))) out.push({ code: K.studio_ui, message: `capture ${S(cap.id) || "?"} shows retired Studio wording (${STUDIO_UI.retired_terms.filter((t) => text.toLowerCase().includes(t.toLowerCase())).join(", ")})` });
  else if (ui !== "dark" && !/\bdark\b/i.test(text)) out.push({ code: K.studio_ui, message: `capture ${S(cap.id) || "?"} does not declare the current dark Studio UI (set ui:"dark"; real screenshots preferred)`, unverified: true });
  return out;
}

// ---- simplifications ------------------------------------------------------------------------------------------------------------------------
export const ALLOWED_SIMPLIFICATIONS = Object.freeze({
  crop_to_region: "crop to the region that matters (the cropped state keeps the source pixels and the label that names the feature)",
  scale_up: "magnify the source state; text that must be read stays at or above the text-height floor",
  dim_non_target: "dim (opacity only) the parts of the screen that are not the point; no whole-frame blur or glow",
  omit_unrelated_chrome: "leave out chrome that plays no part in the claim (window controls, unrelated sidebar rows) without inventing replacements",
  compress_wait: "shorten a real wait; a visible condition names it (e.g. 'sped up')",
  reduce_rows: "show fewer rows of a list; a visible label says the list is abridged and the shown rows are real",
  demonstration_data: "clearly labelled demonstration content in place of private data; it is never presented as a customer or result",
});
export const FORBIDDEN_SIMPLIFICATIONS = Object.freeze(["invent_function", "invent_message", "invent_social_proof", "invent_metric", "change_result_values", "restyle_to_light", "fake_cursor_result"]);
const NEEDS_LABEL = new Set(["compress_wait", "reduce_rows", "demonstration_data"]);

// ---- which stages a claim needs --------------------------------------------------------------------------------------------------------------
// The claim kind decides; a beat may name its own stages instead. Only stages the claim needs are planned.
export const STAGE_PLAN_BY_KIND = Object.freeze({
  state: ["context", "hold"], // "this is what it looks like"
  capability: ["context", "action", "result", "hold"], // "you do X and Y happens"
  flow: ["context", "action", "result", "isolate", "hold"], // multi-step, with a detail that must survive
  detail: ["result", "isolate", "hold"], // one value or region the claim is about
  result: ["result", "hold"],
});

// ---- reading windows: content and context decide ----------------------------------------------------------------------------------------------
// seconds = orientation (a new screen) + words / rate + isolate re-read; a floor for a first read, never a proof of comprehension.
export function readingSeconds(content, { newContext = false, isolate = false, wordsPerSecond = 3.2, orientation = 0.7, floor = 0.8 } = {}) {
  const n = typeof content === "number" ? content : words(Array.isArray(content) ? content.join(" ") : content);
  const s = Math.max(floor, (newContext ? orientation : 0.25) + n / wordsPerSecond + (isolate ? 0.4 : 0));
  return { min_s: r3(s), basis: `orientation ${newContext ? orientation : 0.25} s + ${n} words / ${wordsPerSecond} per s${isolate ? " + 0.4 s isolate re-read" : ""}, floor ${floor} s` };
}

const idList = (anchors) => {
  const ids = new Set();
  const add = (x) => { if (isObj(x) && x.id) ids.add(S(x.id)); else if (typeof x === "string") ids.add(S(x)); };
  if (Array.isArray(anchors)) anchors.forEach(add);
  else if (isObj(anchors)) { arr(anchors.anchors).forEach(add); arr(anchors.regions).forEach(add); }
  return ids;
};
const rightsOf = (rights, id) => {
  if (!rights || !id) return null;
  if (Array.isArray(rights)) { const r = rights.find((x) => x && (x.asset_id === id || x.id === id)); return r ? S(r.status) : null; }
  const v = rights[id]; return isObj(v) ? S(v.status) : v == null ? null : S(v);
};

// ---- the planner -----------------------------------------------------------------------------------------------------------------------------
// beat: { id, claim_id, claim_kind?, product_name?, depicts_studio?, product_version?, text?, window_s?|interval?, demonstration?,
//         stages?: [{stage, source_state_ref:{kind:"capture"|"demonstration", id, digest?}, interval?, labels?, conditions?, simplifications?, anchor_ids?,
//                    anchor_roles?:{window,content,highlight,language,camera}, content?:[{kind,text,claim_id?}], action_id?, read_text?, region?}],
//         states?: {<stage>: capture_id}, shared_anchor? }
// captures: research/screens.json entries plus {id, ui?, date?, outdated?, superseded_by?, digest?, sha256?, product_version?, rights_asset_id?}
export function planChoreography(beat, { captures = [], claims = [], rights = null, anchors = null, score = null, now = Date.now(), claimsPolicy } = {}) {
  const b = isObj(beat) ? beat : {};
  const blocks = [], errors = [], warnings = [];
  const block = (code, message, extra = {}) => blocks.push({ code, message, beat: S(b.id) || null, ...extra });
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const capById = new Map(arr(captures).filter(isObj).map((c) => [S(c.id || c.path), c]));
  const anchorIds = anchors == null ? null : idList(anchors);
  const studio = b.depicts_studio === true || isStudioName(b.product_name);
  const claim = arr(claims).find((c) => c && c.id === b.claim_id) || null;
  const kind = S(b.claim_kind) || "capability";

  // 1. claim binding: a product behavior claim names a ledger entry; stamp and carry-check it (provenance.mjs)
  if (!b.claim_id) block(K.source_state, "the beat claims product behavior but names no claim_id: bind it to the claims ledger", { claim_id: null });
  else if (!claim) block(K.source_state, `claim ${b.claim_id} is not in the claims ledger`, { claim_id: b.claim_id });
  else if (S(b.text)) {
    const item = stampClaim({ id: S(b.id) || "beat", text: S(b.text), makes_claim: true }, claim);
    const cc = carryCheck({ ledger: [claim], items: { storyboard_shots: [item] }, now, ...(claimsPolicy ? { policy: claimsPolicy } : {}) });
    for (const p of cc.problems) block(K.source_state, `claim ${b.claim_id}: ${p.problem}${p.detail ? ` (${p.detail})` : ""}`, { claim_id: b.claim_id, problem: p.problem });
  }

  // 2. stages: the beat's own, else the plan for its claim kind (bound through `states`)
  const wanted = arr(b.stages).length ? arr(b.stages).map((s) => S(s && s.stage)) : (STAGE_PLAN_BY_KIND[kind] || STAGE_PLAN_BY_KIND.capability);
  const raw = arr(b.stages).length
    ? arr(b.stages).filter(isObj)
    : wanted.map((st) => ({ stage: st, source_state_ref: isObj(b.states) && b.states[st] ? { kind: "capture", id: S(b.states[st]) } : null }));
  const order = raw.map((s) => PRODUCT_STAGES.indexOf(S(s.stage)));
  if (order.some((i) => i < 0)) err(K.stage_order, `unknown stage (allowed: ${PRODUCT_STAGES.join(", ")})`);
  else if (order.some((v, i) => i && v <= order[i - 1])) err(K.stage_order, `stages must run in the order ${PRODUCT_STAGES.join(" -> ")} without repeats`);
  if (raw.some((s) => S(s.stage) === "action") && !raw.some((s) => S(s.stage) === "result")) err(K.stage_order, "an action stage needs a result stage: show what the action did");

  const labels = new Set(), conditions = new Set(), simplifications = [], layers = [], stages = [];
  let prevCapture = null;
  raw.forEach((s, i) => {
    const st = S(s.stage), ref = isObj(s.source_state_ref) ? s.source_state_ref : null;
    const demo = (ref && ref.kind === "demonstration") || (!ref && b.demonstration === true);
    const where = { stage: st, index: i };
    let cap = null;

    // 2a. source state binding
    if (!ref || !S(ref.id)) block(K.source_state, `stage ${st} has no approved source state: name a capture id or labelled demonstration content`, { ...where, capture_id: null });
    else if (demo) {
      labels.add("Demonstration");
      if (!S(s.demonstration_label) && !S(b.demonstration_label) && !arr(s.labels).length) block(K.source_state, `stage ${st}: demonstration content needs a visible label`, { ...where, capture_id: S(ref.id) });
      layers.push({ id: `${S(b.id) || "beat"}:${st}`, source: "deterministic", depicts: ["ui"], editorial_reconstruction: true, visible_label: S(s.demonstration_label || b.demonstration_label) || arr(s.labels)[0] || "", supported_behavior: b.supported_behavior === true, performance_claim: S(b.performance_claim) || null, asset_sha: S(ref.id) });
    } else {
      cap = capById.get(S(ref.id)) || null;
      if (!cap) block(K.source_state, `capture ${S(ref.id)} is missing from the approved captures`, { ...where, capture_id: S(ref.id) });
      else {
        if (cap.outdated === true || S(cap.superseded_by)) block(K.stale, `capture ${S(ref.id)} is outdated${S(cap.superseded_by) ? ` (superseded by ${S(cap.superseded_by)})` : ""}: recapture or approve an alternative`, { ...where, capture_id: S(ref.id) });
        if (S(ref.digest) && S(cap.digest) && S(ref.digest) !== S(cap.digest)) block(K.stale, `capture ${S(ref.id)} changed since the stage was bound (digest mismatch)`, { ...where, capture_id: S(ref.id) });
        if (S(b.product_version) && S(cap.product_version) && S(b.product_version) !== S(cap.product_version)) block(K.stale, `capture ${S(ref.id)} shows product ${S(cap.product_version)}, the claim is about ${S(b.product_version)}`, { ...where, capture_id: S(ref.id) });
        const age = cap.date ? (now - Date.parse(String(cap.date).length === 7 ? cap.date + "-01" : cap.date)) / 864e5 : null;
        if (age !== null && Number.isFinite(age) && age > 180) warnings.push({ code: K.stale, message: `capture ${S(ref.id)} is ${Math.round(age)} days old: confirm the UI has not changed`, ...where, capture_id: S(ref.id) });
        const rs = rightsOf(rights, S(cap.rights_asset_id) || S(cap.id));
        if (rs && RIGHTS_STATUS.includes(rs) && rs !== "granted") block(K.approval, `capture ${S(ref.id)} rights are ${rs}`, { ...where, capture_id: S(ref.id) });
        if (S(cap.use) === "reference-only") block(K.source_state, `capture ${S(ref.id)} is reference-only: it may not appear in the film`, { ...where, capture_id: S(ref.id) });
        if (studio) for (const p of checkStudioCapture(cap)) block(p.code, p.message, { ...where, capture_id: S(ref.id) });
        layers.push({ id: `${S(b.id) || "beat"}:${st}`, source: "deterministic", depicts: ["ui"], asset_sha: S(cap.sha256) || S(cap.id) });
      }
    }
    if (studio) {
      const said = [...arr(s.labels), ...arr(s.conditions), S(s.read_text)].join(" ").toLowerCase();
      const hit = STUDIO_UI.retired_terms.filter((t) => said.includes(t.toLowerCase()));
      if (hit.length) block(K.studio_ui, `stage ${st} uses retired Studio wording (${hit.join(", ")}); the current stepper is ${STUDIO_UI.stepper.join(" . ")}`, where);
    }

    // 2b. simplifications declared per stage; forbidden ones block, unknown ones are errors, some require a visible label
    for (const sp of arr(s.simplifications).map(S)) {
      if (FORBIDDEN_SIMPLIFICATIONS.includes(sp)) block(K.source_state, `stage ${st}: "${sp}" fabricates product behavior and is never allowed`, { ...where, simplification: sp });
      else if (!ALLOWED_SIMPLIFICATIONS[sp]) err(K.source_state, `stage ${st}: simplification "${sp}" is not in the allowed list (${Object.keys(ALLOWED_SIMPLIFICATIONS).join(", ")})`, where);
      else { simplifications.push({ stage: st, simplification: sp, rule: ALLOWED_SIMPLIFICATIONS[sp] }); if (NEEDS_LABEL.has(sp) && !arr(s.labels).length && !arr(s.conditions).length) err(K.source_state, `stage ${st}: "${sp}" needs a visible label or condition`, where); }
    }
    // 2c. content: customer messages, testimonials, metrics and social proof only from a source (capture or ledger claim), never to fill a frame
    for (const c of arr(s.content).filter(isObj)) {
      const ck = S(c.kind).toLowerCase();
      if (/message|testimonial|review|quote|social|metric|stat|customer|logo/.test(ck)) {
        const cl = c.claim_id ? arr(claims).find((x) => x && x.id === c.claim_id) : null;
        if (!(cap && c.from_capture === true) && !cl && !demo) block(K.source_state, `stage ${st}: ${ck} "${S(c.text).slice(0, 40)}" has no source (capture or ledger claim): not invented for the animation`, { ...where, content_kind: ck });
        if (demo && !cl) { labels.add("Demonstration"); if (/testimonial|review|social|metric|stat/.test(ck)) block(K.source_state, `stage ${st}: demonstration content may not stand in for ${ck}`, { ...where, content_kind: ck }); }
      }
    }
    arr(s.labels).map(S).filter(Boolean).forEach((l) => labels.add(l));
    arr(s.conditions).map(S).filter(Boolean).forEach((l) => conditions.add(l));

    // 2d. anchors: every role names an anchor from the plan; consecutive stages share at least one (else a declared re-anchor intermediate)
    const roles = isObj(s.anchor_roles) ? s.anchor_roles : {};
    const ids = [...new Set([...arr(s.anchor_ids).map(S), ...Object.values(roles).map(S), ...(S(b.shared_anchor) ? [S(b.shared_anchor)] : [])].filter(Boolean))];
    if (anchorIds) for (const id of ids) if (!anchorIds.has(id)) err(K.unresolved_ref, `stage ${st}: anchor ${id} is not in the composition anchor plan`, { ...where, anchor_id: id });
    if (!ids.length) warnings.push({ code: K.unresolved_ref, message: `stage ${st} names no anchor: windows, content, highlight, language and camera cannot share one`, ...where });

    // 2e. reading window from content and context
    const newContext = !prevCapture || (cap && prevCapture !== S(cap.id)) || (demo && prevCapture !== "demo");
    const readText = [S(s.read_text), ...arr(s.labels), ...arr(s.conditions), ...arr(s.content).map((c) => S(c && c.text))].join(" ");
    const read = ["context", "result", "isolate", "hold"].includes(st) ? readingSeconds(readText, { newContext: !!newContext, isolate: st === "isolate" }) : { min_s: 0.6, basis: "action transit: the action is seen to start and finish, not read" };
    const authored = num(isObj(s.reading_window) ? s.reading_window.min_s : null);
    if (authored !== null && authored < read.min_s) warnings.push({ code: K.reading_window, message: `stage ${st}: authored reading window ${authored} s is shorter than the content suggests (${read.min_s} s)`, ...where });
    prevCapture = cap ? S(cap.id) : demo ? "demo" : prevCapture;
    stages.push({ id: S(s.id) || `${S(b.id) || "beat"}.${st}`, stage: st, capture_id: cap ? S(cap.id) : null, demonstration: demo, source_state_ref: ref, interval: s.interval ?? s.window_s ?? null, labels: arr(s.labels).map(S), conditions: arr(s.conditions).map(S), simplifications: arr(s.simplifications).map(S), anchor_ids: ids, anchor_roles: roles, action_id: S(s.action_id) || null, region: s.region || null, reading: { min_s: Math.max(read.min_s, authored || 0), basis: read.basis, authored_min_s: authored } });
  });

  // 3. exact-asset authority: a Studio/product screen is a deterministic layer from a capture, never a generated image
  const ma = mediaAuthority(layers);
  for (const p of ma.problems) block(K.source_state, `${p.layer}: ${p.problem}${p.fix ? ` (${p.fix})` : ""}`, { layer: p.layer, problem: p.problem });

  // 4. time: allocate the beat window over the stages when none were authored; the reading floors must fit
  const win = isObj(b.interval) ? [num(b.interval.start_s), num(b.interval.end_s)] : Array.isArray(b.window_s) ? [num(b.window_s[0]), num(b.window_s[1])] : null;
  const unset = stages.filter((s) => !s.interval);
  if (win && win[0] !== null && win[1] !== null && win[1] > win[0] && unset.length === stages.length && stages.length) {
    const need = stages.map((s) => s.reading.min_s);
    const total = need.reduce((a, c) => a + c, 0), len = win[1] - win[0];
    if (len + 1e-9 < total) err(K.reading_window, `the beat window is ${r3(len)} s but the stages need at least ${r3(total)} s to be read: lengthen the beat or drop a stage`, { need_s: r3(total), have_s: r3(len) });
    else {
      const extra = len - total, holdIdx = stages.map((s) => s.stage).lastIndexOf("hold");
      let t = win[0];
      stages.forEach((s, i) => { const d = need[i] + (i === (holdIdx >= 0 ? holdIdx : stages.length - 1) ? extra : 0); s.interval = [r3(t), r3(t + d)]; t += d; });
    }
  } else if (!win && stages.length && !stages.some((s) => s.interval)) warnings.push({ code: K.reading_window, message: "no beat window or stage intervals: reading windows are floors only, to be placed on the score" });
  for (const s of stages) {
    const iv = Array.isArray(s.interval) ? s.interval : isObj(s.interval) ? [num(s.interval.start_s), num(s.interval.end_s)] : null;
    if (iv && iv[0] !== null && iv[1] !== null && iv[1] - iv[0] + 1e-9 < s.reading.min_s) err(K.reading_window, `stage ${s.stage}: ${r3(iv[1] - iv[0])} s is shorter than its reading floor ${s.reading.min_s} s`, { stage: s.stage });
  }

  // 5. intermediate states between consecutive stages: the shared anchors carry the composition; a change of source state is declared
  const intermediates = [];
  for (let i = 1; i < stages.length; i++) {
    const a = stages[i - 1], c = stages[i], shared = a.anchor_ids.filter((x) => c.anchor_ids.includes(x));
    intermediates.push({ from: a.stage, to: c.stage, shared_anchor_ids: shared, mechanism: shared.length ? "shared_anchor" : "declared_reanchor", source_state_changes: a.capture_id !== c.capture_id, must_survive: c.stage === "isolate" ? "the isolated region keeps the source pixels, the feature label and its condition" : "the important source state stays recognizable through the move" });
    if (!shared.length && a.anchor_ids.length && c.anchor_ids.length) warnings.push({ code: K.unresolved_ref, message: `stages ${a.stage} -> ${c.stage} share no anchor: declare the re-anchor as a visible move`, from: a.stage, to: c.stage });
  }

  // 6. normalized record (the beat-plan `product` key) and runtime op list (mapped onto RasanUI by the scene page)
  const record = normalizeProduct({ id: S(b.product_id) || `${S(b.id) || "beat"}.product`, claim_id: S(b.claim_id) || null, depicts_studio: studio, ui: studio ? STUDIO_UI.ui : S(b.ui) || null, demonstration: stages.some((s) => s.demonstration),
    stages: stages.map((s) => ({ id: s.id, stage: s.stage, interval: s.interval, source_state_ref: s.source_state_ref, labels: s.labels, conditions: s.conditions, simplifications: s.simplifications, anchor_ids: s.anchor_ids, action_id: s.action_id, reading_window: { interval: s.interval, min_s: s.reading.min_s } })) }, score);
  const runtime = stages.map((s) => ({ op: { context: "mount", action: "cursor", result: "reveal", isolate: "isolate", hold: "hold" }[s.stage], stage: s.stage, ui: "RasanUI", at: Array.isArray(s.interval) ? s.interval[0] : null, until: Array.isArray(s.interval) ? s.interval[1] : null, follow_anchors: s.anchor_ids, hold_min_s: s.stage === "hold" || s.stage === "result" || s.stage === "isolate" ? s.reading.min_s : null, source: s.capture_id ? `research/screens.json#${s.capture_id}` : null }));
  const blocked = blocks.length > 0;
  const digest = canonicalDigest({ b: S(b.id), claim: S(b.claim_id), st: stages.map((s) => [s.stage, s.capture_id, s.anchor_ids]), blocks: blocks.map((x) => [x.code, x.capture_id || x.claim_id || null]) }).slice(0, 16);
  return { ok: !blocked && !errors.length, blocked, blocks, errors, warnings, stages, intermediates, required_labels: [...labels], conditions: [...conditions], simplifications, reading: { total_min_s: r3(stages.reduce((a, s) => a + s.reading.min_s, 0)) }, studio_ui: studio ? STUDIO_UI.ui : null, record, runtime, digest, status: "implemented_unvalidated" };
}
