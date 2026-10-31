// Cross-reference summary of a run's reference films (refs.mjs summarize) and the bounded per-film targets the gates and writers read.
// Reference numbers only ever NUDGE a gate inside sane bounds: one odd reference cannot turn a gate off or make it absurd.
import fs from "node:fs";
import path from "node:path";

export const SOUND_ATLAS = { vo: "vo-kinetic", song: "song-lyric", instrumental: "instrumental-arc", "sfx-led": "sfx-led" };
const rd = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const num = (a) => a.filter((x) => typeof x === "number" && Number.isFinite(x));
const pctile = (a, p) => { const s = num(a).sort((x, y) => x - y); return s.length ? s[Math.max(0, Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1))))] : null; };
const med = (a) => pctile(a, 50);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const tally = (arr) => { const m = new Map(); for (const x of arr.filter(Boolean)) m.set(String(x), (m.get(String(x)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k, count: n })); };
const kindOf = (c) => (c && typeof c === "object" ? c.kind || c.what : c);

// the bounds (a run with one reference still lands inside them)
export const BOUNDS = {
  shot_median_s: [1.0, 3.5], shot_p10_min_s: [0.3, 0.8], shot_p90_max_s: [3.5, 8],
  sfx_per_10s: [0.5, 4], sfx_cap_per_s: [0.15, 1], hard_cuts_per_10s: [0, 3],
};

export function summarizeRefs(run) {
  const dir = path.join(run, "refs"), idx = rd(path.join(dir, "index.json"));
  if (!idx || !Array.isArray(idx.refs)) return null;
  const films = [];
  for (const r of idx.refs) {
    const s = rd(path.join(dir, r.id, "stats.json"));
    if (!s) continue;
    const b = rd(path.join(dir, r.id, "breakdown.json"));
    films.push({ id: r.id, s, b });
  }
  if (!films.length) return null;
  // shot lengths: the analyst's shot table (read from the sheets: sees morphs, carries and wipes) when it has one, else the scene-score cuts
  const analystShots = (f) => {
    const ts = ((f.b && f.b.shots) || []).map((x) => (Array.isArray(x.t) ? Number(x.t[0]) : parseFloat(x.t))).filter(Number.isFinite).sort((a, b) => a - b);
    if (ts.length < 5) return null;
    const dur = f.s.video.duration_s, L = ts.map((t, i) => (i + 1 < ts.length ? ts[i + 1] : dur) - t).filter((x) => x > 0.05);
    return { count: ts.length, median_s: r2(med(L)), p10_s: r2(pctile(L, 10)), p90_s: r2(pctile(L, 90)), per_10s: r2((ts.length / dur) * 10), source: "analyst" };
  };
  const S0 = (f) => f.s.shots.by_threshold["0.1"]; // the sensitive threshold: closest to the hand counts (morphs and carries are changes too)
  const S = (f) => analystShots(f) || { ...S0(f), source: "scene-score" };
  const rows = films.map((f) => ({
    id: f.id, duration_s: f.s.video.duration_s, shot_median_s: S(f).median_s, shot_p10_s: S(f).p10_s, shot_p90_s: S(f).p90_s, shots_per_10s: S(f).per_10s, shot_source: S(f).source,
    shot_median_s_at_0_25: f.s.shots.by_threshold["0.25"].median_s, hard_cuts: f.s.cuts.hard_cuts, hard_cuts_per_10s: f.s.cuts.hard_cuts_per_10s,
    sfx_per_10s: f.s.sfx ? f.s.sfx.per_10s_overall : null, sound_mode: f.s.sound_mode.mode, bpm: f.s.music ? f.s.music.bpm : null, lufs: f.s.loudness ? f.s.loudness.lufs : null, lra: f.s.loudness ? f.s.loudness.lra : null,
    first_cut_s: f.s.hook.first_cut_s, first_word_s: f.s.hook.first_word_s, shots_in_first_3s: f.s.hook.shots_in_first_3s, tail_silence_s: f.s.hook.tail_silence_s,
    cuts_on_music_share: f.s.sync.cuts_vs_music_onsets.share, visual_on_word_share: f.s.sync.visual_changes_vs_word_starts.share, visual_on_word_lift: f.s.sync.visual_changes_vs_word_starts.lift,
    breaks: f.s.music ? f.s.music.breaks.length : 0, analysed: !!f.b,
  }));
  const bs = films.map((f) => f.b).filter(Boolean);
  const modes = tally(rows.map((r) => r.sound_mode));
  const rules = {
    shot_length: { median_s: r2(med(rows.map((r) => r.shot_median_s))), p10_s: r2(med(rows.map((r) => r.shot_p10_s))), p90_s: r2(med(rows.map((r) => r.shot_p90_s))), per_10s: r2(med(rows.map((r) => r.shots_per_10s))), range_median_s: [Math.min(...rows.map((r) => r.shot_median_s)), Math.max(...rows.map((r) => r.shot_median_s))], note: "from the 0.1 scene threshold (hard cuts plus fast morphs and big in-frame moves; the first favourite measured 2.2 s here against 1.9 s counted by hand); shot_median_s_at_0_25 per film is the cuts-only view" },
    hard_cuts: { per_10s_median: r2(med(rows.map((r) => r.hard_cuts_per_10s))) },
    sfx: { per_10s_median: r2(med(rows.map((r) => r.sfx_per_10s))), per_10s_range: rows.some((r) => r.sfx_per_10s != null) ? [Math.min(...num(rows.map((r) => r.sfx_per_10s))), Math.max(...num(rows.map((r) => r.sfx_per_10s)))] : null, note: "transient-detected, +/-30%; the favourites are sparse (about 2 per 10 s), one sound at each section change or hard cut" },
    sound_mode: { counts: modes, dominant: modes.length ? modes[0].id : null, atlas: modes.length ? SOUND_ATLAS[modes[0].id] || null : null },
    loudness: { lufs_median: r2(med(rows.map((r) => r.lufs))), lra_median: r2(med(rows.map((r) => r.lra))) },
    hook: { first_cut_median_s: r2(med(rows.map((r) => r.first_cut_s))), first_word_median_s: r2(med(rows.map((r) => r.first_word_s))), shots_in_first_3s_median: r2(med(rows.map((r) => r.shots_in_first_3s))) },
    sync: { cuts_on_music_share_median: r2(med(rows.map((r) => r.cuts_on_music_share))), visual_on_word_share_median: r2(med(rows.map((r) => r.visual_on_word_share))), note: "share of cuts within 150 ms of a music onset (or visual changes of a word start); cuts follow events, not a metronome grid" },
    breaks: { films_with_a_break: rows.filter((r) => r.breaks > 0).length, note: "a designed 0.5-3 s break followed by a hit is how the favourites place a world flip" },
    carriers: tally(bs.map((b) => kindOf(b.carrier))),
    moves: tally(bs.flatMap((b) => (b.shots || []).map((s) => s.move))).slice(0, 12),
    techniques: tally(bs.flatMap((b) => (b.shots || []).map((s) => s.technique))).slice(0, 12),
    atlas_worlds: tally(bs.map((b) => b.atlas_style_world && (b.atlas_style_world.id || b.atlas_style_world))),
    image_use: tally(bs.flatMap((b) => (Array.isArray(b.image_use) ? b.image_use : []).map((i) => i && (i.kind || i.type)))),
    story: bs.length ? { hook_end_s: r2(med(bs.map((b) => b.story && b.story.hook && b.story.hook.end_s))), turn_at_s: r2(med(bs.map((b) => b.story && b.story.turn && b.story.turn.at_s))), brand_first_shown_s: r2(med(bs.map((b) => b.story && b.story.brand_first_shown_s))) } : null,
    proposed_moves: tally(bs.flatMap((b) => (b.proposed_moves || []).map((m) => m && m.id))),
  };
  // bounded per-film targets
  const measured = rows.filter((r) => r.shot_source === "analyst");
    const sfxMed = rules.sfx.per_10s_median;
  const targets = {
    // shot targets only from the analyst's table: scene scores cannot see a morph, so they would call a morph-led film slow
    shot_median_s: measured.length ? { min: r2(clamp(Math.min(...measured.map((r) => r.shot_median_s)) * 0.85, ...BOUNDS.shot_median_s)), max: r2(clamp(Math.max(...measured.map((r) => r.shot_median_s)) * 1.15, ...BOUNDS.shot_median_s)) } : null,
    shot_p10_min_s: measured.length ? r2(clamp(Math.min(...measured.map((r) => r.shot_p10_s)) * 0.8, ...BOUNDS.shot_p10_min_s)) : null,
    shot_p90_max_s: measured.length ? r2(clamp(Math.max(...measured.map((r) => r.shot_p90_s)) * 1.15, ...BOUNDS.shot_p90_max_s)) : null,
    sfx_per_10s: sfxMed == null ? null : r2(clamp(sfxMed, ...BOUNDS.sfx_per_10s)),
    sfx_cap_per_s: sfxMed == null ? null : r2(clamp((sfxMed * 1.5) / 10, ...BOUNDS.sfx_cap_per_s)),
    hard_cuts_per_10s_max: r2(clamp((rules.hard_cuts.per_10s_median || 0) * 2 + 0.5, ...BOUNDS.hard_cuts_per_10s)),
    sound_mode: rules.sound_mode.dominant, sound_mode_atlas: rules.sound_mode.atlas,
    hook_first_change_by_s: r2(clamp(rules.hook.first_cut_median_s ?? 3, 1, 4)),
    cuts_on_music_share_min: rules.sync.cuts_on_music_share_median == null ? null : r2(clamp(rules.sync.cuts_on_music_share_median * 0.7, 0.3, 0.6)),
    bounds: BOUNDS,
  };
  return { format: "ref-summary@1", made: new Date().toISOString(), films: rows, rules, targets, read_me: "Targets for THIS film, taken from the user's own reference films: writers aim at them, gates nudge their limits inside the stated bounds. References inform, never copy: no frame, sound or exact type of a reference goes into the film." };
}

// the bounded targets of a run, or null (no references, no summary)
export function refTargets(run) {
  if (!run) return null;
  const s = rd(path.join(path.resolve(String(run)), "refs", "summary.json"));
  return s && s.targets ? s.targets : null;
}
// frame-gate: the launch / promo shot-length limits (defaults when the run has no references)
export function shotLimits(run, G) {
  const t = refTargets(run);
  if (!t || !t.shot_median_s) return { lo: G.shot_median_lo, hi: G.shot_median_hi, err: G.shot_median_err, p10: G.shot_p10_min, p90: G.shot_p90_max, fromRefs: false };
  const hi = Math.max(G.shot_median_hi, t.shot_median_s.max);
  return { lo: Math.min(G.shot_median_lo, t.shot_median_s.min), hi, err: Math.max(G.shot_median_err, hi + 1), p10: Math.min(G.shot_p10_min, t.shot_p10_min_s), p90: Math.max(G.shot_p90_max, t.shot_p90_max_s), fromRefs: true };
}
// slop / sound: the SFX per second a run may carry, never above the mode's own budget and never under the floor
export function sfxCapPerSec(run, modePerSec) {
  const t = refTargets(run);
  if (!t || t.sfx_cap_per_s == null) return modePerSec;
  return Math.min(modePerSec, Math.max(BOUNDS.sfx_cap_per_s[0], t.sfx_cap_per_s));
}

// designed-SFX density band (per 10 s): warn outside lo-hi, error above err. 1.5-2.2 / 3 by default; the run's own reference density moves it, inside BOUNDS
export function sfxDensityBand(run) {
  const t = refTargets(run);
  if (!t || t.sfx_per_10s == null) return { lo: 1.5, hi: 2.2, err: 3, fromRefs: false };
  const [bl, bh] = BOUNDS.sfx_per_10s, lo = r2(clamp(t.sfx_per_10s * 0.8, bl, 1.5)), hi = r2(clamp(Math.max(t.sfx_per_10s * 1.2, lo + 0.4), lo + 0.4, bh));
  return { lo, hi, err: r2(clamp(hi * 1.35, 2, bh)), fromRefs: true };
}

// ---- the reference-analyst's output (refs/<id>/breakdown.json): the form check crew.mjs and refs.mjs share
export const MOVE_RE = /^[a-z0-9][a-z0-9-]*$/;
const SHOT_KEYS = ["t", "see", "words", "technique", "move"];
export function checkBreakdown(b, id, moveIds) {
  const P = [], W = [];
  if (!b || typeof b !== "object") return { P: [`${id}: breakdown.json is missing or not valid JSON`], W };
  if (!Array.isArray(b.shots) || b.shots.length < 3) P.push(`${id}: shots[] needs at least 3 rows (t, see, words, technique, move)`);
  else b.shots.forEach((s, i) => {
    for (const k of SHOT_KEYS) if (s == null || (k === "move" ? !(k in s) : s[k] == null || s[k] === "")) W.push(`${id}: shots[${i}] has no ${k} (move may be null when nothing fits)`);
    const mv = s && s.move;
    if (mv && typeof mv === "string" && moveIds && !moveIds.has(mv) && !(s.proposed_move && s.proposed_move === mv)) W.push(`${id}: shots[${i}].move "${mv}" is neither a library move id nor a proposed_move`);
  });
  const need = { carrier: b.carrier, signature_moment: b.signature_moment, story: b.story, image_use: b.image_use, atlas_style_world: b.atlas_style_world, sound: b.sound, take: b.what_to_take, avoid: b.what_not_to_copy };
  for (const [k, v] of Object.entries(need)) if (v == null || (Array.isArray(v) && !v.length) || v === "") P.push(`${id}: breakdown.json has no ${k}`);
  if (b.story && typeof b.story === "object") for (const k of ["hook", "turn", "proof", "close"]) if (!b.story[k]) W.push(`${id}: story.${k} is empty`);
  if (Array.isArray(b.proposed_moves)) for (const m of b.proposed_moves) if (!m || !MOVE_RE.test(String(m.id || ""))) P.push(`${id}: a proposed move has no kebab-case id`);
  return { P, W };
}

