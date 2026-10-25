#!/usr/bin/env node
// Plan 12: audience adaptation, accessibility and professional delivery. One CLI over lib/destination-profiles, variants, localize, captions, a11y,
// delivery-manifest and interchange. Also reachable as `crew.mjs delivery ...`. Everything prints one JSON object. Nothing encodes, renders, installs
// or opens the network. Verbs that write say so; everything else only reads.
//
//   node delivery.mjs profiles [list|show <id>|add --file <profile.json>|check --id <id> [--duration s] [--aspect a:b]] [--registry <file>]
//   node delivery.mjs target [show|pin --profile <id> [--reason t]|offer|migrate --accept] --run <run>        (pin and migrate write delivery/target.json; offer is read-only)
//   node delivery.mjs variant needs --run <run> --profile <id> [--parent-duration s] [--parent-aspect a:b]
//   node delivery.mjs variant plan  --input <variant-input.json>                        (diff + approval need; read-only)
//   node delivery.mjs variant write --input <variant-input.json> --run <run>            (writes delivery/variants/<id>.json; blocked-on-approval is recorded, not hidden)
//   node delivery.mjs variant invalidate --run <run> --change <change.json>            (which variants go stale; read-only)
//   node delivery.mjs variant reflow --input <reflow.json> | crop --input <crop.json>
//   node delivery.mjs localize check --input <translation.json> | font --input <fontplan.json> | script --text "..." --locale ar | glossary add|show --run <run> ...
//   node delivery.mjs captions build --run <run> [--project <dir>] [--language en] [--policy <file>] [--write [--out dir]]
//   node delivery.mjs captions check --run <run> --file <captions.srt|vtt> ...         (sync and readability of an existing caption file)
//   node delivery.mjs a11y requirements --run <run> [--profile id] | contrast --input f | flash --input f | motion --input f | distinctions --input f
//   node delivery.mjs package plan|build|verify --spec <spec.json> --run <run> [--root <dir> ...]  (build writes exports/<id>/; a failure leaves a record under delivery/failures/)
//   node delivery.mjs interchange model --spec <timeline.json> | verify --spec ... | export --spec ... --out <dir> | doctor | capabilities | editors | relink --model m --package <dir>
//   node delivery.mjs choices show|save --run <run> [--scope project|series --series <dir>] --file <choices.json>    (saved only when asked)
//   node delivery.mjs plan --run <run> [--write]                                         (the summary the Final area reads: delivery/plan.json)
//   node delivery.mjs capabilities
import fs from "node:fs";
import path from "node:path";
import { parseArgs, STATE_DIR } from "./lib/common.mjs";
import { atomicWrite } from "./lib/recovery.mjs";
import { SCHEMA_VERSION } from "./lib/contracts.mjs";
import * as Prof from "./lib/destination-profiles.mjs";
import * as Var from "./lib/variants.mjs";
import * as Loc from "./lib/localize.mjs";
import * as Cap from "./lib/captions.mjs";
import * as A11y from "./lib/a11y.mjs";
import * as Pkg from "./lib/delivery-manifest.mjs";
import * as Ic from "./lib/interchange.mjs";
import { buildRegistry, surface } from "./lib/capabilities.mjs";
import { scoreTiming } from "./lib/timing.mjs";
import { filmWords } from "./lib/deliver.mjs";
import { readSeries, writeSeries } from "./lib/series.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const jr = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const need = (v, what) => { if (!v || v === true) { out({ ok: false, error: `${what} is required` }, 1); } return v; };
function out(obj, code = 0) { process.stdout.write(JSON.stringify(obj, null, 2) + "\n"); process.exit(code); }
const input = (a) => { const f = need(a.input || a.spec || a.file, "--input"); const j = jr(path.resolve(String(f))); if (!j) out({ ok: false, error: `could not read JSON from ${f}` }, 1); return j; };

const registryFile = (a) => path.resolve(String(a.registry && a.registry !== true ? a.registry : path.join(STATE_DIR, "destination-profiles.json")));
const runOf = (a) => path.resolve(String(need(a.run, "--run")));
const flat = (v) => (Array.isArray(v) ? v : v === undefined || v === true ? [] : [v]);

function getProfile(a, id) { const all = Prof.loadRegistry(registryFile(a)); return all.find((p) => p.id === id) || null; }

// everything the Final area shows, assembled from files that already exist. Pure reads except for --write.
function compilePlan(run, a = {}) {
  const target = Prof.readTarget(run);
  const profile = target && target.profile;
  const latest = profile ? getProfile(a, profile.id) : null;
  const st = profile ? Prof.profileStatus(profile) : null;
  const brief = jr(path.join(run, "brief.json")) || {};
  const score = jr(path.join(run, "motion", "score.json"));
  const variants = Var.readVariants(run);
  const rows = buildRegistry({}).filter((c) => /^(interchange|delivery)\./.test(c.id)).map(surface);
  const delivered = jr(path.join(run, "hybrid", "renders", "delivered.json"));
  const revs = Object.values(jr(path.join(run, "crew", "revision-latest.json"))?.revisions || {}).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const lastRev = revs[revs.length - 1] || null;
  const film = { has_speech: !!(score && (score.narration || arr(jr(path.join(run, "motion", "audio_meta.json"))?.voices).length)), has_meaningful_sound: false, silent_visual_explanation: !!(score && !score.narration) };
  const req = A11y.requiredDeliverables({ brief, profile: profile || {}, film });
  const capDir = path.join(run, "delivery", "captions");
  const have = (rx) => { try { return fs.readdirSync(capDir).some((n) => rx.test(n)); } catch { return false; } };
  const present = { captions: have(/\.(srt|vtt)$/i), transcript: have(/transcript.*\.txt$/i) && !have(/descriptive/i) ? true : have(/^transcript\.[^.]*\.txt$/i), descriptive_transcript: have(/descriptive/i) };
  const required_files = req.deliverables.map((id) => ({ id, why: req.why[id], status: present[id] === true ? "present" : ["audio_description_track"].includes(id) ? "not_implemented" : ["reduced_motion_variant", "muted_safe_check", "captions_burned_in"].includes(id) ? "needs_render_or_review" : "not_generated" }));
  const plan = {
    schema_version: SCHEMA_VERSION, kind: "delivery_plan", status: "implemented_unvalidated", generated_at: new Date().toISOString(),
    target: profile ? { id: profile.id, label: profile.label, version: profile.version, kind: profile.kind, aspect: profile.aspect, width: profile.resolution.w, height: profile.resolution.h, state: st.state, warnings: st.warnings, source: profile.source && (profile.source.title || profile.source.url) || null, verified_at: profile.verified_at } : null,
    migration: profile && latest ? Prof.migrationOffer(target, latest) : { offer: false },
    variants: variants.map((v) => ({ id: v.id, locale: v.locale, status: v.status, approval: v.approval && v.approval.state, needs: v.needs, profile_id: v.profile && v.profile.id })),
    render: { delivered: delivered ? { file: delivered.file || null, frames: delivered.frames ?? null, published_at: delivered.published_at || null } : null, revision_stage: lastRev ? lastRev.stage : null, note: delivered ? "a delivered render exists" : "no delivered render recorded yet" },
    required_files,
    package_contents: Object.keys(Pkg.LAYOUT).map((role) => ({ role, folder: Pkg.LAYOUT[role] })),
    capabilities: rows.map((c) => ({ id: c.id, label: c.label, state: c.ui_state, reason: c.blocked_by ? c.blocked_by.reason : "", verification: c.verification_status })),
    saved_choices: jr(path.join(run, "delivery", "choices.json")),
    notes: ["profile requirements without a source and date are assumptions, not platform rules", "a valid .otio is not proof an editor imports it"],
  };
  return plan;
}

const args = parseArgs();
const [cmd, sub] = [args._[0], args._[1]];

if (cmd === "profiles") {
  const reg = registryFile(args);
  if (!sub || sub === "list") out({ ok: true, registry: reg, profiles: Prof.loadRegistry(reg).map((p) => ({ id: p.id, label: p.label, version: p.version, kind: p.kind, aspect: p.aspect, state: Prof.profileStatus(p).state })) });
  else if (sub === "show") { const p = getProfile(args, need(args._[2] || args.id, "profile id")); out(p ? { ok: true, profile: p, status: Prof.profileStatus(p), safe_regions: Prof.safeRegionsOf(p), compliance_note: Prof.complianceNote(p) } : { ok: false, error: "no such profile" }, p ? 0 : 1); }
  else if (sub === "add") { const p = Prof.saveProfile(reg, input(args)); out({ ok: true, profile: p, status: Prof.profileStatus(p), note: p.downgraded_from ? `recorded as ${p.kind}: an official_requirement needs a source and verified_at` : "saved to the global registry; no project target was changed" }); }
  else if (sub === "check") { const p = getProfile(args, need(args.id, "--id")); if (!p) out({ ok: false, error: "no such profile" }, 1); out({ ok: true, ...Prof.checkOutput(p, { duration_s: args.duration ? Number(args.duration) : undefined, aspect: args.aspect && args.aspect !== true ? args.aspect : undefined }) }); }
  else out({ ok: false, error: "profiles list|show|add|check" }, 1);
} else if (cmd === "target") {
  const run = runOf(args), t = Prof.readTarget(run);
  if (!sub || sub === "show") out({ ok: true, target: t, status: t ? Prof.profileStatus(t.profile) : null });
  else if (sub === "pin") { const p = getProfile(args, need(args.profile, "--profile")); if (!p) out({ ok: false, error: "no such profile" }, 1); out({ ok: true, target: Prof.pinTarget(run, p, { reason: args.reason && args.reason !== true ? args.reason : "" }) }); }
  else if (sub === "offer" || sub === "migrate") {
    if (!t) out({ ok: false, error: "the project has no pinned target" }, 1);
    const latest = getProfile(args, t.profile_id);
    const offer = Prof.migrationOffer(t, latest);
    if (sub === "offer" || !args.accept) out({ ok: true, offer, accepted: false, note: "nothing changed: pass --accept to re-pin; accepted exports are never changed" });
    if (!offer.offer) out({ ok: true, offer, accepted: false });
    out({ ok: true, offer, accepted: true, target: Prof.acceptMigration(run, latest, { by: "owner" }) });
  } else out({ ok: false, error: "target show|pin|offer|migrate" }, 1);
} else if (cmd === "variant") {
  if (sub === "needs") { const run = runOf(args); const p = getProfile(args, need(args.profile, "--profile")); if (!p) out({ ok: false, error: "no such profile" }, 1); const brief = jr(path.join(run, "brief.json")) || {}; out({ ok: true, ...Prof.variantNeeds({ brief, profile: p, parent: { duration_s: args["parent-duration"] ? Number(args["parent-duration"]) : brief.duration, aspect: args["parent-aspect"] && args["parent-aspect"] !== true ? args["parent-aspect"] : brief.aspect } }) }); }
  else if (sub === "plan" || sub === "write") {
    const i = input(args);
    const rec = Var.variantRecord({ ...i, profile: i.profile });
    if (sub === "plan") out({ ok: true, variant: rec });
    out({ ok: true, variant: rec, file: Var.writeVariant(runOf(args), rec), note: rec.status === "blocked_on_approval" ? "recorded as blocked: a new claim or a different narrative needs the story approval, not an export toggle" : "planned: story, research and valid assets are kept" });
  } else if (sub === "invalidate") { const run = runOf(args); out({ ok: true, ...Var.invalidate(Var.readVariants(run), input({ input: args.change })) }); }
  else if (sub === "reflow") out({ ok: true, ...Var.reflowPlan(input(args)) });
  else if (sub === "crop") out({ ok: true, ...Var.cropCheck(input(args)) });
  else out({ ok: false, error: "variant needs|plan|write|invalidate|reflow|crop" }, 1);
} else if (cmd === "localize") {
  if (sub === "check") { const i = input(args); const src = i.source || {}; const rec = Loc.translationRecord({ ...i, source: src }); out({ ok: true, ...Loc.checkTranslation(rec, src) }); }
  else if (sub === "font") out({ ok: true, ...Loc.fontPlan(input(args)) });
  else if (sub === "script") out({ ok: true, ...Loc.scriptInfo(String(args.text || ""), String(args.locale || "")) });
  else if (sub === "glossary") { const run = runOf(args); const act = args._[2] || "show"; if (act === "add") out(Loc.addGlossary(run, { term: args.term, locale: args.locale, spoken_as: args["spoken-as"], ipa: args.ipa, source: "owner" })); else out({ ok: true, entries: Loc.readGlossary(run) }); }
  else out({ ok: false, error: "localize check|font|script|glossary" }, 1);
} else if (cmd === "captions") {
  const run = runOf(args);
  const policy = args.policy && args.policy !== true ? jr(path.resolve(args.policy)) || {} : (getProfile(args, (Prof.readTarget(run) || {}).profile_id)?.captions?.policy_values || {});
  if (sub === "build") {
    const project = args.project && args.project !== true ? path.resolve(args.project) : run;
    const score = jr(path.join(run, "motion", "score.json"));
    const scenes = score ? scoreTiming(score).scenes.map((s) => ({ n: s.n, start: s.start_s })) : [];
    const fw = filmWords(project, scenes);
    if (!fw.words.length) out({ ok: false, error: "no word timings found (audio_meta.json voices or a transcript.json): captions are not guessed", status: "needs_timings" }, 2);
    const aligned = Loc.alignment(fw.words.map((w) => ({ ...w })), { locale: String(args.language || "und") });
    let cues = Cap.buildCues(fw.words, policy);
    const ns = Cap.addNonSpeech(cues, jr(path.join(run, "motion", "cues.json")));
    cues = ns.cues;
    const dur = score ? scoreTiming(score).total_s : null;
    const sync = Cap.syncCheck(cues, { duration_s: dur, policy, expect_words: fw.words.length });
    const result = { ok: sync.ok, language: String(args.language || "und"), cues: cues.length, words_from: fw.source, alignment: { status: aligned.status, low_confidence: aligned.low_confidence }, non_speech_added: ns.non_speech_added, non_speech_unlabelled: ns.unlabelled, sync, policy: Cap.policyFrom(policy) };
    if (args.write) {
      const dir = path.resolve(args.out && args.out !== true ? args.out : path.join(run, "delivery", "captions"));
      fs.mkdirSync(dir, { recursive: true });
      const lang = String(args.language || "und");
      result.files = Cap.writeSidecars(dir, "captions", cues, { language: lang, note: sync.policy_needs_validation ? "caption timing policy is a configured default" : "" });
      atomicWrite(path.join(dir, `transcript.${lang}.txt`), Cap.transcriptText(cues, { language: lang }));
      result.files.transcript = `transcript.${lang}.txt`;
    }
    out(result, sync.ok ? 0 : 2);
  } else if (sub === "check") {
    const f = path.resolve(need(args.file, "--file")); const raw = fs.readFileSync(f, "utf8");
    const cues = parseCaptionFile(raw);
    out({ ok: true, cues: cues.length, ...Cap.syncCheck(cues, { duration_s: args.duration ? Number(args.duration) : null, policy }) });
  } else out({ ok: false, error: "captions build|check" }, 1);
} else if (cmd === "a11y") {
  if (sub === "requirements") { const run = runOf(args); const brief = jr(path.join(run, "brief.json")) || {}; const t = Prof.readTarget(run); out({ ok: true, ...A11y.requiredDeliverables({ brief, profile: (t && t.profile) || {}, film: input({ input: args.film || path.join(run, "delivery", "film-facts.json") }) }) }); }
  else if (sub === "contrast") out({ ok: true, ...A11y.checkContrast(input(args).items, input(args).thresholds) });
  else if (sub === "flash") out({ ok: true, ...A11y.flashRisk(input(args).series, input(args).thresholds) });
  else if (sub === "motion") out({ ok: true, ...A11y.reducedMotionPlan(input(args).motions) });
  else if (sub === "distinctions") out({ ok: true, ...A11y.distinctionsCheck(input(args).groups) });
  else out({ ok: false, error: "a11y requirements|contrast|flash|motion|distinctions" }, 1);
} else if (cmd === "package") {
  const spec = input(args);
  const run = args.run && args.run !== true ? path.resolve(args.run) : null;
  const roots = flat(args.root).map((r) => path.resolve(String(r)));
  if (!roots.length && run) roots.push(run);
  if (sub === "plan") { const p = Pkg.planPackage(spec, { roots, run }); out({ ok: p.ok, ...p, decisions: p.decisions.map(({ abs, ...d }) => d) }, p.ok ? 0 : 2); }
  else if (sub === "build") { const r = Pkg.buildPackage({ run, spec, roots }); out(r, r.ok ? 0 : 2); }
  else if (sub === "verify") { const dir = path.resolve(need(args.dir || args.package, "--dir")); out(Pkg.verifyPackage(dir)); }
  else out({ ok: false, error: "package plan|build|verify" }, 1);
} else if (cmd === "interchange") {
  if (sub === "doctor") out({ ok: true, ...Ic.doctor() });
  else if (sub === "capabilities") out({ ok: true, capabilities: Ic.capabilityStates(buildRegistry({}).map(surface)), pin_file: path.relative(process.cwd(), Ic.PIN_FILE) });
  else if (sub === "editors") out({ ok: true, round_trips: Ic.EDITOR_ROUND_TRIPS, note: "each is not_run: record results in Plan 14 only; no editor compatibility is claimed" });
  else if (sub === "model") { const r = Ic.timelineModel(input(args)); out({ ok: r.ok, problems: r.problems, model: r.model }, r.ok ? 0 : 2); }
  else if (sub === "verify") { const r = Ic.timelineModel(input(args)); const v = Ic.verifyModel(r.model); out({ ok: r.ok && v.ok, problems: [...r.problems, ...v.problems], loss_report: r.model.loss_report }, r.ok && v.ok ? 0 : 2); }
  else if (sub === "export") { const r = Ic.timelineModel(input(args)); if (!r.ok) out({ ok: false, problems: r.problems }, 2); const e = Ic.exportOtio({ model: r.model, outDir: path.resolve(need(args.out, "--out")) }); out(e, e.ok ? 0 : 2); }
  else if (sub === "relink") { const m = jr(path.resolve(need(args.model, "--model"))); const pk = path.resolve(need(args.package, "--package")); out(Ic.relinkCheck(m, pk, jr(path.join(pk, "MANIFEST.json")))); }
  else out({ ok: false, error: "interchange model|verify|export|doctor|capabilities|editors|relink" }, 1);
} else if (cmd === "choices") {
  const run = runOf(args); const f = path.join(run, "delivery", "choices.json");
  if (!sub || sub === "show") out({ ok: true, project: jr(f), series: args.series && args.series !== true ? (readSeries(path.resolve(args.series)).export_choices || null) : null });
  else if (sub === "save") {
    const c = input(args); const scope = args.scope === "series" ? "series" : "project";
    if (scope === "series") { const dir = path.resolve(need(args.series, "--series")); const s = readSeries(dir); s.export_choices = { ...c, saved_at: new Date().toISOString() }; writeSeries(dir, s); out({ ok: true, scope, note: "saved to the series because you asked" }); }
    atomicWrite(f, JSON.stringify({ schema_version: SCHEMA_VERSION, ...c, saved_at: new Date().toISOString() }, null, 2) + "\n"); out({ ok: true, scope, file: path.relative(run, f), note: "saved to this project because you asked" });
  } else out({ ok: false, error: "choices show|save" }, 1);
} else if (cmd === "plan") {
  const run = runOf(args); const p = compilePlan(run, args);
  if (args.write) atomicWrite(path.join(run, "delivery", "plan.json"), JSON.stringify(p, null, 2) + "\n");
  out({ ok: true, written: !!args.write, plan: p });
} else if (cmd === "capabilities") {
  out({ ok: true, capabilities: buildRegistry({}).filter((c) => /^(interchange|delivery)\./.test(c.id)).map(surface) });
} else {
  out({ ok: false, error: "usage: delivery.mjs profiles|target|variant|localize|captions|a11y|package|interchange|choices|plan|capabilities (see the header)" }, 1);
}

// a small tolerant SRT/VTT reader for `captions check`
function parseCaptionFile(raw) {
  const ts = (s) => { const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(s); return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000 : null; };
  return raw.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => { const L = b.split("\n"); const i = L.findIndex((l) => l.includes("-->")); if (i < 0) return null; const [a, bb] = L[i].split("-->"); const s = ts(a), e = ts(bb); if (s === null || e === null) return null; const text = L.slice(i + 1).join("\n").trim(); return { start: s, end: e, text, lines: text.split("\n"), kind: /^\[.*\]$/.test(text) ? "non_speech" : "speech" }; }).filter(Boolean);
}
