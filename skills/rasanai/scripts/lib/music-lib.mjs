// Music logic that needs no network: the source chain, the measured quality gate, the music brief
// written from the film's arc, the curated catalog's schema, licence notes for a user's own
// library, and the credit lines. music.mjs uses it; selftest.mjs tests it offline.
// Pure Node + ffmpeg (no Python, no librosa).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode, loudness } from "./audio.mjs";

// ---------------------------------------------------------------- keys (only ever the user's own)

export const KEYS = {
  elevenlabs: "RASANAI_ELEVENLABS_API_KEY",
  stable: "RASANAI_STABILITY_API_KEY",
  epidemic: "RASANAI_EPIDEMIC_TOKEN",
};

// ---------------------------------------------------------------- the source chain

// user -> curated catalog (licensed / local) -> AI (to the film's timing, only with the film's own generation consent) -> HeyGen -> ccMixter -> Openverse (last, stricter).
// Generated music is an optional lane under consent, budget and capability rules: it never sits ahead of appropriate licensed or local music, and a key in the
// environment is capability, not per-film consent (opts.generationConsent, i.e. --allow-generation, or an explicit "ai" in --sources, turns it on).
// An explicit --sources list that names ai before catalog is a user pin and is kept in that order.
// Never: Jamendo's API (non-commercial terms), Freesound's API at runtime, Bensound, scraping Pixabay,
// Uppbeat, YouTube Audio Library, Artlist, Epidemic, Envato, Musicbed or Soundstripe, Higgsfield seed_audio
// (a speech model, not for beds). A source with no key or no sign-in drops out without a word.
export const THRESHOLD = { user: 0, ai: 65, catalog: 60, heygen: 65, ccmixter: 70, openverse: 75, procedural: 50 };
export const PRIOR = { user: 1.0, ai: 1.0, catalog: 0.9, mixkit: 0.8, heygen: 0.7, ccmixter: 0.5, openverse: 0.3, procedural: 0.85 };

export function sourceChain(env = process.env, opts = {}) {
  const has = (k) => !!(env[k] && String(env[k]).trim());
  const vendors = [];
  if (has(KEYS.elevenlabs)) vendors.push("elevenlabs");
  if (has(KEYS.stable)) vendors.push("stable-audio");
  const pinned = Array.isArray(opts.sources) ? opts.sources : null;
  const consent = !!opts.generationConsent || !!(pinned && pinned.includes("ai"));
  const aiPinnedFirst = !!(pinned && pinned.includes("ai") && (!pinned.includes("catalog") || pinned.indexOf("ai") < pinned.indexOf("catalog")));
  const aiWhy = !vendors.length ? `no ${KEYS.elevenlabs} or ${KEYS.stable} in the environment`
    : !consent ? `${vendors.join(" then ")} key found, but generation is off for this film: a key is a capability, not consent. Pass --allow-generation (the film's explicit consent, within its budget) or name ai in --sources`
    : `${vendors.join(" then ")}: takes generated to the film's arc (optional, after the licensed and local library unless pinned first)`;
  const ai = { id: "ai", on: vendors.length > 0 && !opts.noAi && consent, vendors, consent, threshold: THRESHOLD.ai, why: aiWhy };
  const chain = [
    { id: "user", on: !!opts.user, threshold: THRESHOLD.user, why: opts.user ? "the user's own track" : "no --track given" },
  ];
  if (aiPinnedFirst) chain.push(ai);
  if (has(KEYS.epidemic)) chain.push({ id: "epidemic-connect", on: true, manual: true, why: "Epidemic Connect (the user's own paid plan, the one route Epidemic allows for AI tools): search and download there, then pass the file with --track <file> --library epidemic-connect" });
  chain.push({ id: "catalog", on: true, threshold: THRESHOLD.catalog, why: "library/music/catalog.json: CC0 / CC BY files fetched on demand, Mixkit only when the user picks it" });
  if (!aiPinnedFirst) chain.push(ai);
  chain.push(
    { id: "heygen", on: true, threshold: THRESHOLD.heygen, why: "HeyGen's catalog (needs the heygen sign-in)" },
    { id: "ccmixter", on: true, threshold: THRESHOLD.ccmixter, why: "ccMixter query API, CC BY, instrumental, BPM within 8% of the target" },
    { id: "openverse", on: true, threshold: THRESHOLD.openverse, why: "last resort: multi-tag query, a stricter threshold" },
  );
  // an original procedural score (original-score.mjs): an explicit choice (--procedural, or "procedural" in --sources: it then comes right after the user's own
  // track) and the offline fallback when no source gave a usable track; never replaces a track the user supplied
  const explicitProc = !!opts.procedural || !!(opts.sources && opts.sources.includes("procedural"));
  chain.push({ id: "procedural", on: true, explicit: explicitProc, fallback: !explicitProc, threshold: THRESHOLD.procedural, why: explicitProc ? "chosen: an original score synthesised offline to the film's events (scripts/original-score.mjs)" : "offline fallback: an original score synthesised to the film's events when no other source gave a usable track" });
  // an explicit --procedural with no --sources is the offline choice: the user's track and the original score only, no catalog or network source
  if (opts.procedural && !opts.sources) opts = { ...opts, sources: ["user", "procedural"] };
  if (opts.sources) {
    const want = new Set(opts.sources);
    if (opts.procedural) want.add("procedural");
    for (const c of chain) if (!want.has(c.id) && c.id !== "user") c.on = false;
  }
  return chain;
}

// ---------------------------------------------------------------- licence notes for a user's own track

export const LIBRARY_NOTES = {
  artlist: { status: "ok", note: "Artlist allows its assets as inputs in AI services (not for training). Paid ads need the Pro plan: the Social plan does not cover paid media. The licence must be in the video owner's name." },
  epidemic: { status: "block", note: "Epidemic's Creator and Pro licences forbid using a track \"in any third party AI tool\": dropping an Epidemic file into RasanAI breaches them. Use Epidemic Connect (their official API / MCP, on your own paid plan) instead, then pass that file with --library epidemic-connect." },
  "epidemic-connect": { status: "ok", note: "Epidemic's sanctioned route for AI tools, on the user's own paid plan. Creator plans do not cover paid ads." },
  musicbed: { status: "warn", note: "Musicbed's terms bar entities that develop, train or operate generative-AI systems; a user dropping a track in is a grey area. Decide knowingly; the declaration is recorded." },
  soundstripe: { status: "ok", note: "No AI-tool clause found. The Personal plan excludes advertising and paid posts: check the plan covers where the film runs." },
  envato: { status: "ok", note: "No AI-tool clause found for music. The licence is per project and in the owner's name; no broadcast." },
  uppbeat: { status: "ok", note: "Free plan: credit required and individual use on your own channels only. Pro / Business cover commercial digital use." },
  premiumbeat: { status: "ok", note: "Standard licence: advertising on websites and social platforms." },
  audionetwork: { status: "ok", note: "The commercial licence covers paid ads and boosted posts; the Creator licence is personal." },
  pixabay: { status: "ok", note: "Commercial use without credit; some uploaders register tracks for Content ID, so keep the track's page." },
  mixkit: { status: "ok", note: "Mixkit Free Music Licence: commercial use incl. online ads, no credit; no TV / radio broadcast, games, remixes, or registering the track with a rights service." },
  "youtube-audio-library": { status: "warn", note: "Safe on YouTube. Use in ads or on a website is ambiguous: check the track's terms." },
  bensound: { status: "block", note: "Bensound's licence bans use in applications that produce videos, including tools using generative AI. Use another track." },
  own: { status: "ok", note: "You own it (or hold the rights). Recorded as your declaration; never verified." },
  other: { status: "ok", note: "Recorded as your declaration; never verified. The licence must be in the video owner's name and cover where the film runs." },
};

export function licenceNote(library) {
  const k = String(library || "other").toLowerCase().replace(/[\s_]+/g, "-");
  return { library: k, ...(LIBRARY_NOTES[k] || LIBRARY_NOTES.other) };
}

// a file, or a folder with the full mix and stems (drums / bass / melody / music / fx / vocals)
export function findUserTrack(p) {
  const AUDIO = /\.(wav|aif|aiff|mp3|m4a|flac|ogg)$/i;
  const st = fs.statSync(p);
  if (st.isFile()) return { mix: p, stems: {} };
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (AUDIO.test(e.name)) files.push(f); } };
  walk(p);
  const STEM = /(drums?|percussion|bass|melod\w*|vocals?|vox|fx|sfx|synths?|keys|stems?)/i;
  const stems = {};
  const mixes = [];
  for (const f of files) {
    const m = (path.basename(f) + (/^stems?$/i.test(path.basename(path.dirname(f))) ? " stem" : "")).match(STEM);
    if (m && files.length > 1) (stems[m[1].toLowerCase()] ||= []).push(f);
    else mixes.push(f);
  }
  mixes.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  const mix = mixes[0] || files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  return mix ? { mix, stems } : null;
}

// ---------------------------------------------------------------- the measured quality gate

class Biquad {
  constructor(type, f, sr, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * f) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
// 4th order (two Butterworth sections) = 24 dB/oct
const chain = (spec, sr) => spec.flatMap(([t, f]) => [new Biquad(t, f, sr), new Biquad(t, f, sr)]);
const BANDS = {
  sub: [["lp", 60]],
  low: [["hp", 60], ["lp", 250]],
  presence: [["hp", 2000], ["lp", 6000]],
  air: [["hp", 10000]],
  hf: [["hp", 16500]],
};
const db = (x) => (x > 0 ? 10 * Math.log10(x) : -120);
const r1 = (x) => Math.round(x * 10) / 10;

// Band balance relative to the track's own full-band level (loudness independent), stereo side/mid,
// crest and loudness range. `start`/`duration` pick the window (the strong section, not the intro).
export function qualityFeatures(file, { start, duration, sr = 44100, lra = true } = {}) {
  const y = decode(file, { sr, channels: 2, start, duration });
  const n = Math.floor(y.length / 2);
  if (n < sr) throw new Error("track too short to measure");
  const fb = Object.fromEntries(Object.entries(BANDS).map(([k, spec]) => [k, [chain(spec, sr), chain(spec, sr)]]));
  const e = { full: 0, sub: 0, low: 0, presence: 0, air: 0, hf: 0, mid: 0, side: 0 };
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const l = y[2 * i], r = y[2 * i + 1];
    e.full += l * l + r * r;
    const m = (l + r) / 2, s = (l - r) / 2;
    e.mid += m * m; e.side += s * s;
    const a = Math.abs(l), b = Math.abs(r);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
    for (const k in fb) {
      let u = l, v = r;
      for (const f of fb[k][0]) u = f.p(u);
      for (const f of fb[k][1]) v = f.p(v);
      e[k] += u * u + v * v;
    }
  }
  const rel = (k) => r1(db(e[k]) - db(e.full));
  const rms = Math.sqrt(e.full / (2 * n));
  const out = {
    sub: rel("sub"), low: rel("low"), presence: rel("presence"), air: rel("air"), hf: rel("hf"),
    side_mid: r1(db(e.side) - db(e.mid)),
    crest: r1(20 * Math.log10((peak || 1e-9) / (rms || 1e-9))),
    peak_dbfs: r1(20 * Math.log10(peak || 1e-9)),
    window: { start: start ?? 0, duration: duration ?? n / sr },
  };
  if (lra) {
    try { const L = loudness(file); out.lra = L.lra; out.lufs = L.lufs; } catch { out.lra = null; }
  }
  return out;
}

// Hard gates (a track that fails one is never shown, except a user's own, which only warns).
// Thresholds from the R3 calibration on 9 reference films, 36 Mixkit tracks and the run6 picks.
export const GATES = {
  sub_min: -24, // thin: no low end (references -4 to -11; thin tracks -25 to -40)
  presence_max: -9, // harsh, mid-forward (references -12.5 to -18)
  air_min: -42, // dull or band-limited master
  hf_gap_min: -25, // (>16.5 kHz) - (>10 kHz): an encoder lowpass at 15-16 kHz. R3 proposed -30; -25 is the value that rejects the band-limited run6 pick (-26.5) and keeps the Mixkit passes (-19 and better)
  side_mid_max: -4.5, // phasey: collapses on phones
  crest_min: 8.5, // squashed (references 10-19)
  flat_lra: 1.5, // with near-mono width, a flat carpet with nothing in it
  near_mono: -20,
};

export function gateTrack(Q, opts = {}) {
  const rejects = [];
  const bad = (gate, value, limit, why) => rejects.push({ gate, value, limit, why });
  if (Q.sub < GATES.sub_min) bad("sub", Q.sub, GATES.sub_min, "no low end: thin on any speaker");
  if (Q.presence > GATES.presence_max) bad("presence", Q.presence, GATES.presence_max, "harsh upper mids");
  if (Q.air < GATES.air_min) bad("air", Q.air, GATES.air_min, "dull or band-limited master");
  if (Q.hf - Q.air < GATES.hf_gap_min) bad("bandwidth", r1(Q.hf - Q.air), GATES.hf_gap_min, "a low-bitrate lowpass at about 16 kHz");
  if (Q.side_mid > GATES.side_mid_max) bad("phase", Q.side_mid, GATES.side_mid_max, "phasey stereo: collapses to mush in mono");
  if (Q.crest < GATES.crest_min) bad("squashed", Q.crest, GATES.crest_min, "over-compressed: no punch");
  if (Q.lra != null && Q.lra < GATES.flat_lra && Q.side_mid < GATES.near_mono) bad("flat-narrow", Q.lra, GATES.flat_lra, "near-mono and flat: a carpet with nothing in it");
  if (opts.narrated && opts.vocals) bad("vocals", true, false, "vocals under a voiceover");
  return rejects;
}

const lin = (x, lo, hi, perLow, perHigh, weight) => Math.max(0, weight - (x < lo ? (lo - x) * perLow : x > hi ? (x - hi) * perHigh : 0));
const ENDING = { stop: 1, decay: 1, "ring-out": 0.8, cut: 0.6, fade: 0.5, none: 0.2, unknown: 0.5 };
const SHAPE = { backtimed: 1, "head+tail": 0.85, "own-fade": 0.7, button: 0.6, fade: 0.35, repeat: 0 };
const TITLE_BAD = /\b(remix|feat\.?|dj|demo|loop|version|8[- ]?bit|chiptune|ringtone)\b|\bmix\)/i;

// Soft score 0-100 (R3 section 6.2). Premium / organic families accept a softer low end.
export function scoreTrack(Q, opts = {}) {
  const soft = /cinematic|organic|premium|ambient/.test(String(opts.family || ""));
  const P = {
    sub: soft ? lin(Q.sub, -16, -6, 3, 3, 15) : lin(Q.sub, -10, -4, 3, 3, 15),
    presence: (() => { const x = Q.presence; return Math.max(0, 15 - (x > -12.5 ? (x > -10 ? 3.75 + (x + 10) * 4 : (x + 12.5) * 1.5) : x < -22 ? (-22 - x) * 2 : x < -18 ? (-18 - x) * 1 : 0)); })(),
    air: lin(Q.air, -35, -18, 2, 2, 10),
    stereo: lin(Q.side_mid, -16, -7, 3, 3, 10),
    crest: lin(Q.crest, 10, 99, 5, 0, 10),
    lra: Q.lra == null ? 7 : Q.lra < 1.5 ? 0 : Q.lra > 10 ? 4 : Q.lra < 2 ? 5 : 10,
  };
  const A = opts.A;
  if (A) {
    const dur = A.duration || 1, sec = (A.strong_sections || [])[0];
    const early = sec ? (sec.t0 / dur <= 0.25 ? 1 : Math.max(0, 1 - (sec.t0 / dur - 0.25) * 2)) : 0;
    const len = sec && A.bar_s ? ((sec.t1 - sec.t0) / A.bar_s >= 8 ? 1 : 0.5) : 0;
    P.structure = 15 * (0.35 * early + 0.25 * len + 0.4 * (ENDING[A.ending?.type] ?? 0.5));
  } else P.structure = 11;
  P.fit = opts.plan ? 10 * (SHAPE[opts.plan.shape] ?? 0.4) * (opts.plan.needs_longer ? 0 : 1) : 7;
  let s = ((P.sub + P.presence + P.air + P.stereo + P.crest + P.lra + P.structure + P.fit) * 100) / 95;
  if (TITLE_BAD.test(String(opts.title || ""))) s -= 10;
  s = Math.max(0, Math.min(100, s));
  return { score: Math.round(s), parts: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, r1(v)])) };
}

// Gate + score for one file. `kind` picks the threshold; a user's own track never fails, it warns.
export function judge(file, { kind = "catalog", family, title, A, plan, narrated, vocals, window } = {}) {
  let w = window;
  if (!w && A && A.strong_sections && A.strong_sections[0]) {
    const s = A.strong_sections[0];
    w = { start: s.t0, duration: Math.min(120, Math.max(10, s.t1 - s.t0)) };
  }
  const Q = qualityFeatures(file, w || {});
  const rejects = gateTrack(Q, { narrated, vocals });
  const sc = scoreTrack(Q, { family, title, A, plan });
  const threshold = THRESHOLD[kind] ?? THRESHOLD.catalog;
  const user = kind === "user";
  const problems = [], warnings = [];
  for (const r of rejects) (user ? warnings : problems).push(`quality gate: ${r.gate} ${r.value} (limit ${r.limit}): ${r.why}`);
  if (!user && sc.score < threshold) problems.push(`quality score ${sc.score} is under ${threshold}`);
  if (user && sc.score < 65) warnings.push(`quality score ${sc.score}: the track measures weak, but it is yours so it stays`);
  return { quality: Q, score: sc.score, parts: sc.parts, rank: Math.round(sc.score * (PRIOR[kind] ?? 0.5)), threshold, rejects, problems, warnings, pass: !problems.length };
}

// ---------------------------------------------------------------- style exclusions (per direction, not global)

// With no sound direction these are the long-standing defaults and every output stays identical. With a direction, instruments and genres are excluded
// only by the user's own constraints (hard) or because the selected feeling rules them out; the stock-library cliche markers stay as a ranking-side word
// filter; structural exclusions (vocals under a voice, supersaws, tempo changes, fade-outs) are about editability, not taste.
export const LEGACY_BANNED_WORDS = ["corporate", "inspirational", "inspiring", "uplifting", "motivational", "positive", "happy", "success", "business", "presentation", "ukulele", "whistl\\w*", "glockenspiel", "background music", "epic trailer"];
export const LEGACY_AVOID = ["vocals", "supersaws", "dubstep wobble", "fade-outs", "tempo changes", "ukulele", "claps", "whistles"];
const STOCK_MARKERS = ["corporate", "business", "presentation", "background music"]; // describe a stock-library cliche, not an instrument or genre
const SENTIMENT_MARKERS = ["inspirational", "inspiring", "uplifting", "motivational", "positive", "happy", "success"];
const STRUCTURAL_AVOID = ["supersaws", "dubstep wobble", "tempo changes", "fade-outs"];
const escRe = (w) => String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// o: { direction: {feeling, vocals_ok, narrated, music_role}|null, constraints: normalizeConstraints() output | {hard:{exclude_terms[]}}|null }
// -> { source, banned_words[], banned_re (global, case-insensitive), avoid[], negative_global_styles[] }
export function styleExclusions(o = {}) {
  const dir = o && o.direction && typeof o.direction === "object" ? o.direction : null;
  const hardTerms = o && o.constraints && o.constraints.hard && Array.isArray(o.constraints.hard.exclude_terms) ? o.constraints.hard.exclude_terms.map(String).filter(Boolean) : [];
  if (!dir && !hardTerms.length) {
    return { source: "legacy_default", banned_words: LEGACY_BANNED_WORDS.slice(), banned_re: new RegExp(`\\b(${LEGACY_BANNED_WORDS.join("|")})\\b`, "gi"), avoid: LEGACY_AVOID.slice(), negative_global_styles: LEGACY_AVOID.slice() };
  }
  const feeling = dir && dir.feeling && (dir.feeling.value || dir.feeling) || null;
  const words = [...STOCK_MARKERS];
  // an upbeat sentiment word is a cliche marker only when the selected feeling is not itself upbeat (playful, warm) or custom
  if (!["playful", "warm", "custom"].includes(String(feeling))) words.push(...SENTIMENT_MARKERS);
  for (const t of hardTerms) words.push(escRe(t));
  const avoid = [...STRUCTURAL_AVOID, ...(dir && dir.vocals_ok ? [] : ["vocals"]), ...hardTerms];
  return { source: dir ? "direction" : "user_constraints", banned_words: [...new Set(words)], banned_re: new RegExp(`\\b(${[...new Set(words)].join("|")})\\b`, "gi"), avoid: [...new Set(avoid)], negative_global_styles: [...new Set(avoid)] };
}

// ---------------------------------------------------------------- the brief written from the arc

export function defaultArc(film) {
  const f = Number(film) || 30;
  const r = (x) => Math.round(x * 10) / 10;
  return { intro_until: r(f * 0.25), drop_at: r(f * 0.35), break: null, payoff_at: r(f * 0.7), button_at: r(f - 2.5) };
}

export function readArc(v, film) {
  let a = null;
  try {
    if (v && typeof v === "object") a = v;
    else if (v && fs.existsSync(String(v))) { const j = JSON.parse(fs.readFileSync(String(v), "utf8")); a = j.music_arc || j; }
    else if (v && /^\s*\{/.test(String(v))) a = JSON.parse(String(v));
  } catch {}
  if (!a || !(a.drop_at > 0) || !(a.button_at > 0)) return { arc: defaultArc(film), derived: true };
  return { arc: { intro_until: a.intro_until ?? a.drop_at * 0.7, drop_at: a.drop_at, break: a.break || null, payoff_at: a.payoff_at ?? a.drop_at + (a.button_at - a.drop_at) * 0.6, button_at: a.button_at }, derived: false };
}

// the sections as bars at `bpm`: boundaries rounded to a bar, none under 3 s (ElevenLabs' minimum)
export function sections(arc, bpm, film) {
  const bar = 240 / bpm;
  const q = (t) => Math.round(t / bar) * bar;
  const end = q(Math.max(film, arc.button_at + 2));
  const marks = [
    ["INTRO", 0, "already playing at frame 1: filtered pad and stabs, no kick"],
    ["BUILD", arc.intro_until, "add sub and groove, the filter opens; the last beat before the drop is a one-beat drop-out"],
    ["DROP", arc.drop_at, "full groove, the energy peak exactly here (the product reveal)"],
    ...(arc.break ? [["BREAK", arc.break[0], "drums out for one bar"]] : []),
    ["PAYOFF", arc.break ? arc.break[1] : arc.payoff_at, "full groove plus a top-line pluck"],
    ["BUTTON", arc.button_at, "hard ending: one final full-band hit on the downbeat, a natural tail under 2 s, no fade-out"],
  ];
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const t0 = i === 0 ? 0 : q(marks[i][1]);
    const t1 = i === marks.length - 1 ? end : q(marks[i + 1][1]);
    if (t1 - t0 < 3 && out.length) { out[out.length - 1].t1 = t1; out[out.length - 1].what += `; ${marks[i][0].toLowerCase()}: ${marks[i][2]}`; continue; }
    out.push({ name: marks[i][0], t0, t1, what: marks[i][2] });
  }
  return out.map((s) => ({ ...s, duration_ms: Math.max(3000, Math.round((s.t1 - s.t0) * 1000)) }));
}

// o.subject / o.tone / o.exclusions are additive: with none of them the text is the long-standing one (a "SaaS launch film", "not cinematic").
// o.subject: what the film is ("product explainer", "brand film"); o.tone: words from the selected direction; o.exclusions: styleExclusions().
export function buildPrompt({ film, bpm, family, arc, narrated, instruments, subject, tone, exclusions }) {
  const secs = sections(arc, bpm, film);
  const fam = family && family.text ? family.text : String(family || "minimal electronic");
  const legacy = !subject && !tone && !exclusions;
  const avoid = exclusions && exclusions.avoid ? exclusions.avoid : LEGACY_AVOID;
  const lines = [
    `BRIEF: Instrumental bed for a ${film} s ${subject || "SaaS launch film"}. No vocals, no vocal chops.`,
    `Genre: ${fam}. ${bpm} BPM, 4/4${instruments ? `, ${instruments}` : ""}. ${legacy ? "Clean modern mix, confident, not cinematic." : `Clean modern mix${tone ? `, ${tone}` : ""}.`}`,
    `Structure (1 bar = ${(240 / bpm).toFixed(2)} s):`,
    ...secs.map((s) => ` ${s.t0.toFixed(1)}-${s.t1.toFixed(1)} s ${s.name}: ${s.what}.`),
    `Mix: ${legacy ? "punchy low end" : "a balanced low end"}${narrated ? ", space at 1-4 kHz for a voice" : ""}.`,
    `Avoid: ${avoid.join(", ")}.`,
  ];
  return { text: lines.join("\n"), sections: secs, bar_s: 240 / bpm };
}

// ElevenLabs Music's composition_plan (bar-exact durations) from the same sections
export function elevenPlan(p, family, exclusions = null) {
  const fam = String(family && family.text ? family.text : family || "minimal electronic").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    positive_global_styles: [...fam, "instrumental", "modern clean mix"],
    negative_global_styles: exclusions && exclusions.negative_global_styles ? exclusions.negative_global_styles.slice() : ["vocals", "supersaws", "dubstep wobble", "fade-out", "tempo changes", "ukulele", "claps", "whistles"],
    sections: p.sections.map((s) => ({ section_name: s.name.toLowerCase(), positive_local_styles: [s.what], negative_local_styles: [], duration_ms: s.duration_ms, lines: [] })),
  };
}

// ---------------------------------------------------------------- the curated catalog

export const ENDINGS = ["ring-out", "stop", "decay", "fade", "cut", "none", "unknown"];
const BLOCKED_LICENCE = /\b(nc|nd|sa|non-?commercial|no-?derivatives?|share-?alike)\b|-nc|-nd|-sa/i;

export function validateCatalog(cat) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!cat || !Array.isArray(cat.tracks)) return ["catalog.json needs a tracks array"];
  const seen = new Set();
  for (const t of cat.tracks) {
    const id = t.id || "(no id)";
    for (const k of ["id", "title", "artist", "licence", "licence_url", "page", "url", "source", "checked_on"]) if (!t[k]) e(`${id}: ${k} missing`);
    if (seen.has(t.id)) e(`${id}: duplicate id`);
    seen.add(t.id);
    if (!Array.isArray(t.family) || !t.family.length) e(`${id}: family must be a non-empty array`);
    if (!(t.bpm > 30 && t.bpm < 260)) e(`${id}: bpm`);
    if (!(t.duration > 20)) e(`${id}: duration`);
    if (!ENDINGS.includes(t.ending)) e(`${id}: ending "${t.ending}" is not one of ${ENDINGS.join(", ")}`);
    if (!/^https:\/\//.test(t.url || "")) e(`${id}: url must be https`);
    if (!/^https:\/\//.test(t.page || "")) e(`${id}: page must be https`);
    if (!["auto", "on-pick"].includes(t.fetch)) e(`${id}: fetch must be auto or on-pick`);
    if (!["self", "upstream"].includes(t.host)) e(`${id}: host must be self or upstream`);
    if (typeof t.mirror_ok !== "boolean") e(`${id}: mirror_ok must be a boolean`);
    if (typeof t.requires_credit !== "boolean") e(`${id}: requires_credit must be a boolean`);
    if (t.requires_credit && !t.credit) e(`${id}: requires a credit but has no credit line`);
    if (BLOCKED_LICENCE.test(t.licence || "") && !/free licen[cs]e/i.test(t.licence || "")) e(`${id}: licence "${t.licence}" is not allowed (no NC, ND or SA)`);
    if (t.fetch === "auto") {
      if (!t.mirror_ok) e(`${id}: auto-fetched files must be mirrorable (CC0 / CC BY)`);
      if (t.sha256 != null && !/^[0-9a-f]{64}$/.test(t.sha256)) e(`${id}: sha256`);
    }
    if (/mixkit/i.test(t.source || "") || /mixkit/i.test(t.url || "")) {
      if (t.fetch !== "on-pick" || t.mirror_ok !== false) e(`${id}: Mixkit tracks are fetched only when the user picks one and are never mirrored`);
    }
    if (t.host === "self" && !t.mirror_ok) e(`${id}: host self needs mirror_ok`);
  }
  return errors;
}

export function loadCatalog(file) {
  const f = file || process.env.RASANAI_MUSIC_CATALOG || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "library", "music", "catalog.json");
  const cat = JSON.parse(fs.readFileSync(f, "utf8"));
  return { cat, file: f };
}

// rank catalog tracks for the intents' families and the target tempo; films shorter than a track's
// strong start are fine (fit backtimes), tracks shorter than film + 4 s are not
export function pickFromCatalog(cat, { families, film, bpmRange, count = 6 }) {
  const minLen = film ? film + 4 : 45;
  const rows = [];
  for (const t of cat.tracks) {
    if (t.duration < minLen) continue;
    const fam = t.family.filter((f) => families.includes(f)).length;
    if (!fam) continue;
    let tempo = 0;
    if (bpmRange) {
      const lo = bpmRange[0] * 0.92, hi = bpmRange[1] * 1.08;
      const cands = [t.bpm, t.felt_bpm].filter(Boolean);
      tempo = cands.some((b) => b >= lo && b <= hi) ? 1 : 0;
    }
    rows.push({ t, rank: fam * 2 + tempo + (t.fetch === "auto" ? 0.5 : 0) + (t.ending === "stop" || t.ending === "decay" ? 0.3 : 0) });
  }
  return rows.sort((a, b) => b.rank - a.rank || a.t.id.localeCompare(b.t.id)).slice(0, count).map((r) => r.t);
}

// ---------------------------------------------------------------- credits

export function creditLine(o) {
  if (o.credit) return o.credit;
  if (o.attribution) return o.attribution;
  if (o.origin === "user") return null;
  return null;
}

// CREDITS.txt (always written) and the paste-ready description lines
export function creditsText(opt) {
  if (!opt) return { credits: "No music.\n", description: "" };
  const line = creditLine(opt);
  const lic = opt.license || opt.licence || "";
  if (opt.origin === "user") {
    return { credits: `Music: "${opt.title}", the producer's own licensed track (${opt.declared || "licence declared by the producer"}). No credit line from RasanAI.\n`, description: "" };
  }
  if (opt.origin === "procedural") {
    const used = Array.isArray(opt.samples_used) ? opt.samples_used : [];
    return { credits: `Music: "${opt.title}", an original score generated by RasanAI for this film from code (no third-party recording or model).${used.length ? ` Samples used: ${used.map((x) => `${x.name || x.id} (${x.license}${x.source ? `, ${x.source}` : ""})`).join("; ")}.` : " Samples used: none."} No credit required.\n`, description: "" };
  }
  if (opt.origin && String(opt.origin).startsWith("ai:")) {
    return { credits: `Music: "${opt.title}", generated for this film with ${opt.origin.slice(3)}. Commercial use under the plan active at generation time (see LICENSES.json).\n`, description: "" };
  }
  if (line && opt.requires_credit !== false) {
    return { credits: `${line}\n\nPaste this credit wherever the video is posted (description, or the end card on platforms with no description).\n`, description: `${line}\n` };
  }
  return { credits: `Music: "${opt.title}"${opt.artist ? ` by ${opt.artist}` : ""}, ${lic || "free licence"}${opt.licence_url ? ` (${opt.licence_url})` : ""}. No credit required.\n`, description: "" };
}
