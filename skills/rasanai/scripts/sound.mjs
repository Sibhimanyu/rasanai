#!/usr/bin/env node
// Sound for the film: music edited to picture, SFX on a budget, and a measured mix check.
// Pure Node + ffmpeg/ffprobe (no Python, no npm). The playbook: references/sound.md.
//
//   node sound.mjs analyze --track <file> [--full]
//       -> {duration, bpm, beat_s, bar_s, bars, bar_db, sections, strong_sections,
//           start_candidates, ending{natural,type,hit,last_audible,tail_s}, loudness, usable, problems}
//   node sound.mjs fit --track <file> [--film <s>] [--scenes scenes.json|timeline.json]
//        [--reveal <s>] [--logo <s>] [--flex 1] [--soft-start] [--out plan.json] [--write-scenes <file>]
//       -> an edit plan that never loops audibly: shape (backtimed | head+tail | own-fade | button |
//          fade | repeat), segments, joins, the film-time bar grid, the reveal/logo moved onto the
//          music, and scene starts snapped to bars. needs_longer: true when the track is too short.
//   node sound.mjs render --plan plan.json --out bed.wav [--lufs -14]
//       -> renders the edited bed (atrim/acrossfade/afade), -14 LUFS, true peak <= -1.5 dBTP
//   node sound.mjs sfx-plan --scenes scenes.json|timeline.json [--events events.json] [--narrated]
//        [--format reel] [--bed bed.wav] [--plan plan.json] [--words audio_meta.json] [--project <dir>]
//       -> SFX cues for causal on-screen events only, inside the density budget, placed by each
//          sample's measured sync point, plus the audio_meta.json "sfx" entries
//   node sound.mjs check (--video <mp4> | --audio <file>) [--film <s>] [--vo <stem>] [--music <stem>]
//        [--sfx <sfx-plan.json|index.html>] [--silent-by-choice "<reason>"] [--plan plan.json] [--events events.json]
//        [--narrated] [--lufs -14]
//       -> measured loudness, true peak, head/tail, dropouts, loops, VO gap, SFX density; with --sfx, error
//          no-sfx when a film of 15 s or more has zero SFX cues (unless --silent-by-choice; without --sfx it is a warning);
//          warnings flat-dynamics (bed LRA under 2.0 LU) and ring-out-ending (the music still audible more than 1.0 s
//          after the logo / cta event from --plan or --events); exit 2 with fixes when anything is off
//   node sound.mjs master (--video <mp4> | --audio <file>) --out <file> [--lufs -14]
//       -> the post-render fix for check's loudness/peak problems: static gain + true-peak limiter
//          (-1.5 dBTP, -2 for AAC/MP3), picture copied untouched
//   node sound.mjs probe <sfx files...>        -> sync point, lead silence, audible end, harshness
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, die, readJSON, writeFile } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import {
  analyzeTrack, publicAnalysis, summarize, fitTrack, renderPlan, masterFile, probeSfx, loudness, loudnessOver,
  decode, findRepeats, onsetProfile, hasAudioStream, probeDuration, requireTools, r1, r3, SR,
} from "./lib/audio.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o) => console.log(JSON.stringify(o, null, 2));
const need = (k, hint) => {
  if (args[k] == null || args[k] === true) die(`--${k} ${hint} required`);
  return String(args[k]);
};
const exists = (p, what) => {
  if (!fs.existsSync(p)) die(`${what} not found: ${p}`);
  return p;
};
try {
  requireTools();
} catch (e) {
  die(e.message);
}

// scenes.json (durations) or timeline.json (start_s/duration_s) -> [{n,title,type,start,duration,...}]
function readScenes(file) {
  const S = readJSON(exists(path.resolve(file), "scenes file"));
  const list = S.scenes || [];
  let t = 0;
  const scenes = list.map((s, i) => {
    const start = s.start_s != null ? Number(s.start_s) : t;
    const duration = Number(s.duration ?? s.duration_s) || 0;
    t = start + duration;
    return { n: s.n ?? i + 1, title: s.title || `Scene ${i + 1}`, type: s.type || "", start, duration, transition_in: s.transition_in || (i ? S.transition_default || "cut" : "cut"), text: [s.visual, s.on_screen, s.notes, s.beat, s.title].filter(Boolean).join(" "), voiceover: s.voiceover || "", events: s.events || null };
  });
  const narrated = S.narrated != null ? !!S.narrated : S.narration !== false && list.some((s) => s.voiceover && String(s.voiceover).trim());
  return { scenes, total: t, narrated, raw: S };
}

// ============================================================== SFX

// what gets a sound, how loud, and which sample (HyperFrames' bundled library by default)
const KINDS = {
  click: { cls: "ui", weight: 3, samples: ["click"], vol: 0.16 },
  type: { cls: "texture", weight: 3, samples: ["typing"], vol: 0.14 },
  key: { cls: "ui", weight: 3, samples: ["key-press"], vol: 0.12 },
  land: { cls: "mid", weight: 3, samples: ["pop"], vol: 0.2, rate: 0.9 },
  snap: { cls: "mid", weight: 3, samples: ["click"], vol: 0.24, rate: 0.85 },
  pop: { cls: "mid", weight: 2, samples: ["pop"], vol: 0.24 },
  toast: { cls: "tonal", weight: 2, samples: ["notification"], vol: 0.2 },
  count: { cls: "tonal", weight: 2, samples: ["ping"], vol: 0.18 },
  reveal: { cls: "hero", weight: 2, samples: ["impact-bass-1"], vol: 0.5 },
  logo: { cls: "hero", weight: 2, samples: ["impact-bass-2", "impact-bass-1"], vol: 0.45 },
  whoosh: { cls: "whoosh", weight: 1, samples: ["whoosh", "whoosh-cinematic"], vol: 0.35 },
  riser: { cls: "riser", weight: 1, samples: ["riser"], vol: 0.4 },
  glitch: { cls: "mid", weight: 2, samples: ["glitch-1"], vol: 0.22 },
  error: { cls: "tonal", weight: 2, samples: ["error"], vol: 0.22 },
};
const ALIAS = { tap: "click", press: "click", toggle: "click", select: "click", typing: "type", settle: "land", thud: "land", lock: "snap", align: "snap", appear: "pop", badge: "toast", notification: "toast", ping: "toast", success: "count", confirm: "count", hit: "reveal", impact: "reveal", transition: "whoosh", swipe: "whoosh" };
const SIZE = { small: 1, medium: 2, large: 3 };
const BUDGET = {
  narrated: { perSec: 1 / 2, perWindow: 3, share: 1 / 3, heroEvery: 15, heroMax: 3, whooshEvery: 20 },
  unnarrated: { perSec: 1 / 1.2, perWindow: 3, share: 1 / 2, heroEvery: 10, heroMax: 6, whooshEvery: 10 },
  reel: { perSec: 1, perWindow: 4, share: 1 / 2, heroEvery: 8, heroMax: 6, whooshEvery: 8 },
};
const VARIANTS = [{ rate: 1, gain_db: 0 }, { rate: 1.035, gain_db: -1.5 }, { rate: 0.965, gain_db: -0.8 }];

function sfxLibrary() {
  const mu = findSkill("media-use");
  const dir = args.library ? path.resolve(String(args.library)) : mu ? path.join(mu, "audio", "assets", "sfx") : null;
  if (!dir || !fs.existsSync(dir)) return { dir: null, files: {} };
  const files = {};
  for (const f of fs.readdirSync(dir)) if (/\.(mp3|wav|ogg|m4a)$/i.test(f)) files[f.replace(/\.\w+$/, "")] = path.join(dir, f);
  return { dir, files };
}

// events from the scene text when no events.json: estimates, marked so; real times come from
// the built composition (the settle/contact frame of each element)
function inferEvents(scenes, plan) {
  const ev = [];
  const last = scenes[scenes.length - 1];
  for (const s of scenes) {
    if (s.events) { for (const e of s.events) ev.push({ ...e, t: s.start + Number(e.at ?? e.t ?? 0), scene: s.n }); continue; }
    const tx = s.text.toLowerCase();
    const at = (f) => r3(s.start + f * s.duration);
    if (/product_intro/.test(s.type) || /\breveal/.test(tx)) ev.push({ t: plan?.moments?.reveal?.t ?? at(0), kind: "reveal", size: "large", scene: s.n, estimated: true });
    if (s === last && (/branding|cta/.test(s.type) || /\blogo\b/.test(tx))) ev.push({ t: plan?.moments?.logo?.t ?? at(0.2), kind: "logo", size: "large", scene: s.n, estimated: true });
    if (/\b(click|clicks|tap|taps|press|presses|toggle)\b/.test(tx)) ev.push({ t: at(0.5), kind: "click", size: "small", scene: s.n, estimated: true });
    if (/\b(type|types|typed|typing)\b/.test(tx)) ev.push({ t: at(0.25), kind: "type", size: "small", scene: s.n, estimated: true });
    if (/\b(lands?|settles?|drops? in|stacks?)\b/.test(tx)) ev.push({ t: at(0.35), kind: "land", size: "medium", scene: s.n, estimated: true });
    if (/\b(snaps?|locks? in|clicks? into place)\b/.test(tx)) ev.push({ t: at(0.4), kind: "snap", size: "medium", scene: s.n, estimated: true });
    if (/\b(notification|toast|badge|alert)\b/.test(tx)) ev.push({ t: at(0.4), kind: "toast", size: "small", scene: s.n, estimated: true });
    if (/\b(counts? up|counter|ticks? up|tallies)\b/.test(tx)) ev.push({ t: at(0.8), kind: "count", size: "medium", scene: s.n, estimated: true });
    if (/zoom-through/.test(s.transition_in) || (/push-slide/.test(s.transition_in) && /signature|fly|flies|travel/.test(tx))) ev.push({ t: r3(s.start), kind: "whoosh", size: "large", scene: s.n, estimated: true, signature: true });
  }
  return ev;
}

function sfxPlan() {
  const sc = readScenes(need("scenes", "<scenes.json|timeline.json>"));
  const plan = args.plan ? readJSON(exists(path.resolve(String(args.plan)), "plan")) : null;
  const narrated = args.narrated ? true : args["no-narration"] ? false : sc.narrated;
  const mode = args.format === "reel" ? "reel" : narrated ? "narrated" : "unnarrated";
  const B = BUDGET[mode];
  const film = plan?.film_duration || sc.total;
  let events;
  if (args.events) {
    const E = readJSON(exists(path.resolve(String(args.events)), "events"));
    events = (Array.isArray(E) ? E : E.events || []).map((e) => ({ ...e }));
  } else events = inferEvents(sc.scenes, plan);
  events = events.map((e, i) => {
    const kind = KINDS[e.kind] ? e.kind : ALIAS[e.kind] || null;
    const scene = e.scene ?? (sc.scenes.find((s) => e.t >= s.start - 1e-6 && e.t < s.start + s.duration) || sc.scenes[sc.scenes.length - 1]).n;
    return { id: e.id || `e${i + 1}`, ...e, kind, raw_kind: e.kind, scene, t: Number(e.t) };
  });
  const skipped = [];
  for (const e of events.filter((e) => !e.kind)) skipped.push({ event: e.id, t: e.t, why: `"${e.raw_kind}" is not a causal event with a sound (${Object.keys(KINDS).join(", ")})` });
  let cand = events.filter((e) => e.kind && Number.isFinite(e.t) && e.t >= 0 && e.t <= film);
  // staggered groups: only the first and the last element get a sound
  const groups = {};
  for (const e of cand) if (e.group) (groups[e.group] ||= []).push(e);
  for (const g of Object.values(groups)) {
    g.sort((a, b) => a.t - b.t);
    for (const e of g.slice(1, -1)) { skipped.push({ event: e.id, t: e.t, why: "inside a stagger: only the first and last items get a sound" }); e._drop = true; }
  }
  cand = cand.filter((e) => !e._drop);
  // whooshes only on signature transitions
  for (const e of cand) if (e.kind === "whoosh" && !e.signature) { skipped.push({ event: e.id, t: e.t, why: "whoosh on an ordinary transition: only signature spatial moves get one" }); e._drop = true; }
  cand = cand.filter((e) => !e._drop);

  const bed = args.bed ? onsetProfile(exists(path.resolve(String(args.bed)), "bed")) : null;
  const words = [];
  if (args.words) {
    const M = readJSON(exists(path.resolve(String(args.words)), "audio meta"));
    for (const v of M.voices || []) {
      const s = sc.scenes.find((x) => x.n === Number(v.frame));
      if (!s) continue;
      for (const w of v.words || []) if (String(w.text || "").replace(/\W/g, "").length >= 4) words.push(s.start + Number(w.start));
    }
  }

  const maxCount = Math.max(1, Math.floor(film * B.perSec));
  // the share cap is over ALL visual events: only an events file lists those (inferred events are
  // already the sound-worthy ones)
  const maxShare = args.events ? Math.max(1, Math.ceil(events.length * B.share)) : Infinity;
  const rank = (e) => (KINDS[e.kind].weight * (SIZE[e.size] || (KINDS[e.kind].cls === "hero" ? 3 : 1))) + (e.priority || 0);
  const order = [...cand].sort((a, b) => rank(b) - rank(a) || a.t - b.t);
  const placed = [];
  const tonalScenes = new Set();
  for (const e of order) {
    const k = KINDS[e.kind];
    const why = (() => {
      if (placed.length >= maxCount) return `budget: ${mode} films get at most ${maxCount} SFX in ${r1(film)} s`;
      if (placed.length >= maxShare) return `budget: at most ${Math.round(B.share * 100)}% of the ${events.length} visual events get a sound (the most causal ones)`;
      if (k.cls === "hero" && e.kind === "logo" && plan?.ending?.kind === "natural" && plan.ending.film_hit != null && Math.abs(plan.ending.film_hit - e.t) < 0.12) return "the track's own ending hit lands the logo";
      if (placed.filter((p) => Math.abs(p.t - e.t) < 1).length + 1 > B.perWindow) return `more than ${B.perWindow} sounds within one second`;
      if (k.cls === "hero") {
        const heroes = placed.filter((p) => KINDS[p.kind].cls === "hero");
        if (heroes.length >= B.heroMax) return `hero hits: at most ${B.heroMax} per film`;
        if (heroes.some((p) => Math.abs(p.t - e.t) < B.heroEvery)) return `hero hits: one per ${B.heroEvery} s`;
      }
      if (k.cls === "whoosh" && placed.some((p) => KINDS[p.kind].cls === "whoosh" && Math.abs(p.t - e.t) < B.whooshEvery)) return `whooshes: one per ${B.whooshEvery} s, signature moves only`;
      if (k.cls === "riser" && placed.some((p) => p.kind === "riser") && film <= 45) return "one riser per film under 45 s";
      if (k.cls === "tonal" && tonalScenes.has(e.scene)) return "one tonal ping per scene";
      return null;
    })();
    if (why) { skipped.push({ event: e.id, t: e.t, kind: e.kind, why }); continue; }
    let gain = 0;
    const notes = [];
    if (bed) {
      const h = bed.strongAt(e.t);
      if (h.strong && (k.cls === "hero" || k.cls === "whoosh" || k.cls === "tonal")) { skipped.push({ event: e.id, t: e.t, kind: e.kind, why: "the music already hits this moment" }); continue; }
      if (h.strong) { gain -= 3; notes.push("music hits here: 3 dB lower"); }
    }
    let t = e.t;
    if (words.length && k.cls !== "hero") {
      const clash = (x) => words.some((w) => Math.abs(w - x) < 0.15);
      if (clash(t)) {
        const later = [0.033, 0.066].map((d) => t + d).find((x) => !clash(x));
        if (later != null) { notes.push(`moved ${Math.round((later - t) * 1000)} ms later, off a stressed word`); t = later; }
        else { skipped.push({ event: e.id, t: e.t, kind: e.kind, why: "lands on a stressed voiceover word" }); continue; }
      }
    }
    if (k.cls === "tonal") tonalScenes.add(e.scene);
    placed.push({ ...e, t, gain, notes });
  }
  placed.sort((a, b) => a.t - b.t);

  // samples, variation (never the same file + pitch twice in a row within 2 s), sync points
  const lib = sfxLibrary();
  const probes = {};
  const probe = (name) => (probes[name] ||= lib.files[name] ? probeSfx(lib.files[name]) : null);
  const lastUse = {};
  const cues = [];
  const project = args.project ? path.resolve(String(args.project)) : null;
  for (const e of placed) {
    const k = KINDS[e.kind];
    const uses = cues.filter((c) => c.kind === e.kind).length;
    const sample = k.samples[uses % k.samples.length];
    const p = probe(sample);
    let v = VARIANTS[uses % VARIANTS.length];
    const lu = lastUse[sample];
    if (lu && e.t - lu.t < 2 && lu.v === v) v = VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length];
    lastUse[sample] = { t: e.t, v };
    const rate = (k.rate || 1) * (k.cls === "hero" || k.cls === "riser" ? 1 : v.rate);
    const sync = p ? p.sync_point / rate : 0;
    const start = Math.max(0, e.t - sync + 0.01); // never lead the picture; 10 ms late reads as natural
    const volume = r3(k.vol * Math.pow(10, (e.gain + (k.cls === "hero" ? 0 : v.gain_db)) / 20));
    const scene = sc.scenes.find((s) => s.n === e.scene) || sc.scenes[0];
    const dur = p ? (p.audible_end - (p.lead_silence > 0.05 ? 0 : 0)) / rate : 1;
    const cue = { event: e.id, kind: e.kind, class: k.cls, t: r3(e.t), start: r3(start), scene: e.scene, sample, file: lib.files[sample] || null, rate: r3(rate), volume, duration_s: r3(dur), sync_point: p ? r3(sync) : null, estimated: !!e.estimated, notes: e.notes };
    if (p && p.warnings.some((w) => /harsh|piercing/.test(w))) cue.notes.push("harsh sample: lowpass 9 kHz applied when rendered");
    if (e.t - sync < 0) cue.notes.push("crest would fall before the film starts: trimmed");
    cue._scene_start = scene.start;
    cues.push(cue);
  }
  // render variants into the project (pitch can't be varied at play time: data-playback-rate keeps pitch)
  if (project && cues.length) {
    const dir = path.join(project, "assets", "sfx", "rasa");
    fs.mkdirSync(dir, { recursive: true });
    for (const c of cues) {
      if (!c.file) continue;
      const p = probes[c.sample];
      const lead = Math.max(0, p.lead_silence - 0.005);
      const name = `${c.sample}${c.rate === 1 ? "" : `-r${Math.round(c.rate * 1000)}`}.wav`;
      const dest = path.join(dir, name);
      const harsh = p.warnings.some((w) => /harsh|piercing/.test(w));
      const lp = c.class === "hero" ? (harsh ? 9000 : null) : harsh ? 9000 : 11000;
      const af = [`atrim=start=${lead.toFixed(3)}:end=${p.audible_end.toFixed(3)}`, "asetpts=PTS-STARTPTS", c.rate !== 1 ? `asetrate=48000*${c.rate},aresample=48000` : null, lp ? `lowpass=f=${lp}` : null, c.class === "hero" || c.class === "riser" ? null : "highpass=f=100", "afade=t=out:st=0:d=0.001", `areverse,afade=t=in:d=0.02,areverse`].filter(Boolean).join(",");
      if (!fs.existsSync(dest)) execFileSync("ffmpeg", ["-y", "-v", "error", "-i", c.file, "-ar", "48000", "-af", af, "-c:a", "pcm_s16le", dest]);
      c.sync_point = r3(Math.max(0, p.sync_point - lead) / c.rate);
      c.start = r3(Math.max(0, c.t - c.sync_point + 0.01));
      c.duration_s = r3((p.audible_end - lead) / c.rate);
      c.file = path.relative(project, dest).split(path.sep).join("/");
    }
  }
  const audio_meta_sfx = cues.filter((c) => c.file).map((c) => ({ frame: c.scene, file: c.file, offset_s: r3(c.start - c._scene_start), duration_s: c.duration_s, volume: c.volume }));
  cues.forEach((c) => delete c._scene_start);
  const est = cues.filter((c) => c.estimated).length;
  out({
    mode,
    film_duration: r3(film),
    budget: { max_sfx: maxCount, placed: cues.length, candidates: cand.length, per_window: B.perWindow, hero_every_s: B.heroEvery, whoosh_every_s: B.whooshEvery },
    cues,
    skipped,
    audio_meta_sfx,
    library: lib.dir,
    notes: [
      est ? `${est} cue time(s) are estimates from the scene text: pass --events with the real settle/contact times from the built composition before final mix` : null,
      !lib.dir ? "no SFX library found (media-use not installed): cues have no files; pass --library <dir>" : null,
      !project ? "pass --project <dir> to render pitch variants, trimmed and filtered, into assets/sfx/rasa/" : null,
    ].filter(Boolean),
  });
}

// ============================================================== check

function sfxTimes(file) {
  const p = path.resolve(file);
  const txt = fs.readFileSync(exists(p, "sfx source"), "utf8");
  if (/\.html?$/i.test(p)) {
    const t = [];
    for (const m of txt.matchAll(/<audio[^>]*id="el-sfx-[^"]*"[^>]*>/g)) {
      const s = m[0].match(/data-start="([\d.]+)"/);
      if (s) t.push({ t: Number(s[1]), kind: (m[0].match(/src="[^"]*?([\w-]+)\.\w+"/) || [])[1] || "sfx" });
    }
    return t;
  }
  const J = JSON.parse(txt);
  if (Array.isArray(J.cues)) return J.cues.map((c) => ({ t: c.t ?? c.start, kind: c.kind || c.sample }));
  return [];
}

function check() {
  const src = args.video || args.audio;
  if (!src) die("--video <mp4> or --audio <file> required");
  const file = exists(path.resolve(String(src)), "input");
  if (!hasAudioStream(file)) {
    out({ ok: false, problems: [{ what: "no audio track", fix: "the render has no sound: check that audio_meta.json has the bed and the index mounts it" }] });
    process.exit(2);
  }
  const target = args.lufs != null ? Number(args.lufs) : -14;
  const problems = [], warnings = [];
  const P = (what, measured, target, fix) => problems.push({ what, measured, target, fix });
  const L = loudness(file);
  const dur = probeDuration(file);
  const y = decode(file);
  const win = (a, b) => {
    let z = 0, c = 0;
    for (let i = Math.max(0, Math.floor(a * SR)); i < Math.min(y.length, Math.floor(b * SR)); i++) { z += y[i] * y[i]; c++; }
    return c ? 10 * Math.log10(z / c + 1e-12) : -120;
  };
  // 50 ms level track
  const step = 0.05;
  const lv = [];
  for (let t = 0; t < y.length / SR; t += step) lv.push(win(t, t + step));
  const sorted = [...lv].filter((v) => v > -80).sort((a, b) => a - b);
  const body = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : -120;
  let fa = lv.findIndex((v) => v > -50);
  let la = lv.length - 1 - [...lv].reverse().findIndex((v) => v > -50);
  const first_audible = fa < 0 ? null : fa * step;
  const last_audible = fa < 0 ? null : (la + 1) * step;
  const first_second_db = win(0, 1);
  const last_30ms_db = win(dur - 0.03, dur);
  const measures = { duration: r3(dur), lufs: L.lufs, true_peak: L.true_peak, lra: L.lra, first_audible: r3(first_audible), last_audible: r3(last_audible), first_second_db: r1(first_second_db), body_level_db: r1(body), last_30ms_db: r1(last_30ms_db) };

  if (L.lufs == null || Math.abs(L.lufs - target) > 1) P("integrated loudness", `${L.lufs} LUFS`, `${target} LUFS +/-1`, `gain the master by ${r1(target - (L.lufs ?? target))} dB (static gain + a true-peak limiter at -1.5 dBTP; sound.mjs render does this for a bed)`);
  if (L.true_peak == null || L.true_peak > -1) P("true peak", `${L.true_peak} dBTP`, "<= -1.0 dBTP", "limit at -1.5 dBTP (4x oversampled) before AAC encoding, then re-check the encoded file");
  if (L.lra != null && L.lra < 2.0) warnings.push(`flat-dynamics: loudness range ${L.lra} LU is under 2.0 LU: the bed never moves (a soft intro, a drop on the reveal, a break before the payoff: references/sound.md, the arc; score music_arc)`);
  if (L.lra != null && L.lra > 11) warnings.push(`loudness range ${L.lra} LU is wide for a short film (target 4-9 LU): compress the VO or tame the loudest section`);
  if (first_audible != null && first_audible > 0.3) P("silent head", `${r1(first_audible)} s of silence`, "sound by 0.3 s", "start the bed at frame 0 (a strong phrase, 'already playing'); trim the file's lead silence");
  if (first_second_db < body - 8) P("quiet opening", `first second ${r1(first_second_db)} dB vs body ${r1(body)} dB`, "within 8 dB of the body", "start the music on a strong section, not its intro (sound.mjs fit picks one); premium styles may open soft on purpose: say so");
  if (last_audible != null && dur - last_audible > 1.5) P("dead air at the end", `${r1(dur - last_audible)} s of silence`, "<= 1.5 s", "backtime the music so its ending (or a button hit's tail) lands on the last frame, or trim the film");
  if (last_30ms_db > -40) P("abrupt ending", `last 30 ms at ${r1(last_30ms_db)} dBFS`, "< -40 dBFS (faded)", "end on the track's own ending or a button, with a 20-50 ms final fade to silence");
  // dropouts: silence >= 0.4 s inside the film
  const gaps = [];
  let run = 0;
  for (let i = fa; i <= la && fa >= 0; i++) {
    if (lv[i] < -50) run++;
    else { if (run * step >= 0.4) gaps.push([r1((i - run) * step), r1(i * step)]); run = 0; }
  }
  measures.silences = gaps;
  if (gaps.length) warnings.push(`silence inside the film at ${gaps.map((g) => `${g[0]}-${g[1]} s`).join(", ")}: fine if designed (a music stop before the reveal), otherwise the bed dropped out`);
  // audible loop: a verbatim repeat of the opening, or a long verbatim block
  const reps = findRepeats(y);
  measures.repeats = reps;
  for (const r of reps) {
    if (r.from < 2 && r.seconds >= 6) P("audible loop", `the opening ${r.seconds} s comes back verbatim at ${r.repeats_at} s`, "no restart of the track", "the bed was looped: fit a longer track (music.mjs --film) or use sound.mjs fit (it never loops)");
    else if (r.seconds >= 12 && r.lag_s >= 16) P("audible loop", `${r.from}-${r.to} s repeats verbatim at ${r.repeats_at} s`, "no verbatim repeat >= 12 s", "a section plays twice: pick a longer track or a head+tail edit (sound.mjs fit)");
  }
  if (args.film != null && Math.abs(dur - Number(args.film)) > 0.1) warnings.push(`audio is ${r3(dur)} s; the film is ${args.film} s`);
  // VO vs music gap from stems
  if (args.vo && args.music) {
    const vo = exists(path.resolve(String(args.vo)), "vo stem"), mu = exists(path.resolve(String(args.music)), "music stem");
    const vy = decode(vo);
    const spans = [];
    let s0 = null, lastOn = -9;
    for (let t = 0; t * SR < vy.length; t += 0.05) {
      let z = 0, c = 0;
      for (let i = Math.floor(t * SR); i < Math.min(vy.length, Math.floor((t + 0.05) * SR)); i++) { z += vy[i] * vy[i]; c++; }
      const on = 10 * Math.log10(z / Math.max(1, c) + 1e-12) > -45;
      if (on) { if (s0 == null || t - lastOn > 1.2) { if (s0 != null) spans.push([s0, lastOn + 0.05]); s0 = t; } lastOn = t; }
    }
    if (s0 != null) spans.push([s0, lastOn + 0.05]);
    const voL = loudness(vo).lufs;
    const muL = loudnessOver(mu, spans);
    const gap = voL != null && muL != null ? voL - muL : null;
    Object.assign(measures, { vo_lufs: voL, music_under_vo_lufs: muL, vo_music_gap_lu: r1(gap), vo_spans: spans.length });
    if (gap != null && (gap < 9 || gap > 15)) P("music vs voiceover", `music ${r1(gap)} LU under the VO`, "12 LU under (9-15)", gap < 9 ? `lower the bed under speech by ${r1(12 - gap)} dB (duck lane or the Voiceover carve)` : `raise the bed under speech by ${r1(gap - 12)} dB: it vanishes`);
  }
  // the ending: the music must stop on the logo / cta (a button), not ring out
  {
    let logoT = null;
    if (args.events) {
      const E = readJSON(exists(path.resolve(String(args.events)), "events"));
      const ts = (Array.isArray(E) ? E : E.events || []).filter((e) => /^(logo|cta|end)/i.test(String(e.kind || e.id || "")) && Number.isFinite(Number(e.t))).map((e) => Number(e.t));
      if (ts.length) logoT = Math.max(...ts);
    }
    if (logoT == null && args.plan) {
      const pl = readJSON(exists(path.resolve(String(args.plan)), "plan"));
      const m = pl.moments?.logo?.t ?? pl.ending?.film_hit ?? null;
      if (m != null && Number.isFinite(Number(m))) logoT = Number(m);
    }
    if (logoT != null) {
      let musicLast = last_audible;
      if (args.music) {
        const my = decode(exists(path.resolve(String(args.music)), "music stem"));
        let ml = null;
        for (let t = 0; t * SR < my.length; t += step) { let z = 0, c = 0; for (let i = Math.floor(t * SR); i < Math.min(my.length, Math.floor((t + step) * SR)); i++) { z += my[i] * my[i]; c++; } if (10 * Math.log10(z / Math.max(1, c) + 1e-12) > -50) ml = t + step; }
        musicLast = ml;
      }
      measures.logo_at = r3(logoT);
      measures.music_last_audible = musicLast == null ? null : r3(musicLast);
      if (musicLast != null && musicLast - logoT > 1.0) warnings.push(`ring-out-ending: the music is still audible ${r1(musicLast - logoT)} s after the logo / cta at ${r1(logoT)} s (button endings preferred: a hard stop on the logo, sound.mjs fit --logo with the track's own ending or a button)`);
    }
  }
  // SFX density
  if (args.sfx) {
    const cues = sfxTimes(String(args.sfx)).sort((a, b) => a.t - b.t);
    const narrated = !!args.narrated || !!args.vo;
    const B = BUDGET[args.format === "reel" ? "reel" : narrated ? "narrated" : "unnarrated"];
    const maxWin = cues.reduce((m, c) => Math.max(m, cues.filter((d) => d.t >= c.t && d.t < c.t + 1).length), 0);
    const whooshes = cues.filter((c) => /whoosh/i.test(c.kind)).length;
    if (!cues.length && dur >= 15) {
      if (args["silent-by-choice"] && args["silent-by-choice"] !== true) measures.silent_by_choice = String(args["silent-by-choice"]);
      else P("no-sfx", `0 SFX cues in a ${r1(dur)} s film`, "cues on transitions, landings, taps, counters and the reveal", "run sound.mjs sfx-plan with the score's events and seams after the build and mount the cues (whoosh on moves through space, hit on landings, click on taps, tick on counters, impact on the reveal); or pass --silent-by-choice \"<reason>\" for a film that is silent on purpose");
    }
    Object.assign(measures, { sfx_count: cues.length, sfx_per_s: r3(cues.length / dur), sfx_max_in_1s: maxWin, whooshes });
    if (cues.length > Math.floor(dur * B.perSec) + 1) P("SFX density", `${cues.length} SFX in ${r1(dur)} s`, `<= ${Math.floor(dur * B.perSec)}`, "keep only causal events (clicks, lands, the reveal): sound.mjs sfx-plan enforces the budget");
    if (maxWin > B.perWindow) P("SFX pile-up", `${maxWin} sounds within one second`, `<= ${B.perWindow}`, "drop or spread the weakest cues");
    if (whooshes > Math.max(1, Math.ceil(dur / B.whooshEvery))) P("whoosh per cut", `${whooshes} whooshes`, `<= ${Math.max(1, Math.ceil(dur / B.whooshEvery))}`, "whooshes only on signature spatial transitions");
  }
  else if (dur >= 15 && !(args["silent-by-choice"] && args["silent-by-choice"] !== true)) warnings.push("no-sfx: no --sfx given, so no sound effects were measured (a film of 15 s or more needs cues: sound.mjs sfx-plan after the build, then --sfx <sfx-plan.json|index.html>)");
  const ok = problems.length === 0;
  out({ ok, file, measures, problems, warnings });
  if (!ok) process.exit(2);
}

// ============================================================== dispatch (last: the tables above must exist)

if (cmd === "analyze") {
  track("Listening to the track: tempo, bars, sections, ending", "Track analysed");
  const f = exists(path.resolve(need("track", "<file>")), "track");
  const A = analyzeTrack(f);
  const o = publicAnalysis(A, { full: !!args.full });
  o.summary = summarize(A);
  out(o);
} else if (cmd === "fit") {
  track("Fitting the music to the film on bar lines", "Music edit planned");
  const f = exists(path.resolve(need("track", "<file>")), "track");
  const sc = args.scenes ? readScenes(String(args.scenes)) : null;
  const film = args.film != null ? Number(args.film) : sc ? sc.total : NaN;
  if (!(film > 0)) die("--film <seconds> (or --scenes with durations) required");
  let reveal = args.reveal != null ? Number(args.reveal) : null;
  let logo = args.logo != null ? Number(args.logo) : null;
  if (sc && reveal == null) {
    const r = sc.scenes.find((s) => /product_intro|reveal/i.test(s.type) || /\breveal/i.test(s.title));
    if (r) reveal = r.start;
  }
  const A = analyzeTrack(f, { quick: true });
  const plan = fitTrack(A, { film, reveal, logo, scenes: sc ? sc.scenes : null, flex: args.flex, softStart: !!args["soft-start"], xfade: args.xfade, preroll: args.preroll });
  plan.track_summary = summarize(A);
  if (args.out) {
    writeFile(path.resolve(String(args.out)), JSON.stringify(plan, null, 2) + "\n");
    plan.render = `node ${path.relative(process.cwd(), process.argv[1])} render --plan ${args.out} --out <bed.wav>`;
  }
  if (args["write-scenes"] && sc && plan.scenes) {
    const S = JSON.parse(JSON.stringify(sc.raw));
    plan.scenes.forEach((p, i) => {
      if (!S.scenes[i]) return;
      if (S.scenes[i].duration_s != null) { S.scenes[i].duration_s = p.duration; S.scenes[i].start_s = p.start; }
      else S.scenes[i].duration = p.duration;
    });
    if (S.total_s != null) S.total_s = plan.film_duration;
    writeFile(path.resolve(String(args["write-scenes"])), JSON.stringify(S, null, 2) + "\n");
    plan.wrote_scenes = path.resolve(String(args["write-scenes"]));
  }
  out(plan);
  if (plan.needs_longer && !plan.segments.length) process.exit(2);
} else if (cmd === "render") {
  track("Cutting the music bed", "Music bed rendered");
  const plan = readJSON(exists(path.resolve(need("plan", "<plan.json>")), "plan"));
  const o = renderPlan(plan, String(need("out", "<bed.wav>")), { lufs: args.lufs != null ? Number(args.lufs) : -14 });
  o.shape = plan.shape;
  o.film_duration = plan.film_duration;
  // the bed sits at -14 LUFS: unnarrated it plays at 1.0; under a ~-16 LUFS VO it should sit
  // ~12 LU lower (-28 LUFS): volume 0.2. check --vo/--music measures the real gap.
  o.volume = { unnarrated: 1.0, under_voiceover: 0.2 };
  if (plan.button_sfx) o.button_sfx = plan.button_sfx;
  out(o);
} else if (cmd === "master") {
  track("Mastering the sound to -14 LUFS", "Sound mastered");
  const src = exists(path.resolve(String(args.video || args.audio || need("audio", "<file> (or --video <mp4>)"))), "input");
  out(masterFile(src, String(need("out", "<file>")), { lufs: args.lufs != null ? Number(args.lufs) : -14 }));
} else if (cmd === "probe") {
  const files = args._.slice(1);
  if (!files.length) die("usage: sound.mjs probe <sfx files...>");
  out(files.map((f) => probeSfx(exists(path.resolve(f), "sfx"))));
} else if (cmd === "sfx-plan") {
  track("Placing sound effects on causal moments only", "SFX planned");
  sfxPlan();
} else if (cmd === "check") {
  track("Measuring the mix: loudness, peaks, loops, SFX density", "Audio checked");
  check();
} else {
  die("usage: sound.mjs analyze|fit|render|sfx-plan|check|master|probe ... (see the header)");
}
