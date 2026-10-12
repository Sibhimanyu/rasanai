// The fluent motion contract: what a motion language means once "precise" stops meaning "uniform".
// R5 (.context/night/R5-motion-fluency.md) measured why our films move like a machine: one ease on most tweens,
// a duration grid, one stagger and a ban on every settle. This file turns a language's signature (its enter / exit /
// move eases and its pace) into the contract motion.md carries and obey.mjs enforces:
//   curves     a curve per role (launch, glide, expressive, exit, settle, snap, drift, move), 4+ families per film
//   durations  from travel distance and size, not a scale (the language sets the pace)
//   mix        no single curve over 40% of gestures, no single duration over 40%, 4+ curve families
//   overlap    the next gesture at 55-75% of the last; secondaries trail 2-4 frames
//   stagger    an amount on a curve plus +-1 frame of jitter, never a constant step
//   overshoot  a budget (share of gestures and the largest overshoot), not a ban, except where the language is rigid
//   arcs       travels over 3% of the frame bend by 4-12%
//   camera     a living frame: a 1.5-4% push or a 0.5-1.5%/s drift per shot
// The same numbers drive runtime/rasan-motion.js (the vocabulary builders call) and lib/obey-mix (the code check).
import { parseEase } from "./common.mjs";

// curves are written as GSAP names, cubic-bezier(x1,y1,x2,y2) or spring(damping, omega); RasanMotion.ease(name)
// turns any of them into an ease function (no CustomEase needed)
export const BASE_CURVES = {
  launch: "cubic-bezier(0.05,0.7,0.1,1)", // M3 emphasized-decelerate: a hard launch and a long visible glide
  glide: "cubic-bezier(0.2,0,0,1)", // M3 standard: a soft start and a long settle (repositions)
  expressive: "cubic-bezier(0.4,0.14,0.3,1)", // Carbon expressive: big travels, felt mass
  exit: "cubic-bezier(0.3,0,0.8,0.15)", // M3 emphasized-accelerate: leaves, about 0.65x the entrance
  settle: "spring(0.68,12)", // about 5% overshoot and one visible return: hero landings only
  snap: "expo.out", // punch: hits and accents, at most a quarter of the gestures
  drift: "sine.inOut", // camera, ground, ambient: 4 s or longer
};

const RIGID = new Set(["mechanical", "robotic", "linear", "choppy-stepped", "glitchy", "stop-motion-like"]);
const BOUNCY = new Set(["elastic", "springy", "bouncy", "playful", "cartoonish", "character"]);
const SOFT = new Set(["organic", "fluid", "liquid", "floating", "weightless", "luxurious-slow", "cinematic", "smooth"]);

// the language's family as the taxonomy knows it, or a guess from its name and eases
export function temperament(p) {
  const id = String(p.language || (p.id || "").replace(/^lang-/, "") || "");
  if (RIGID.has(id) || /steps|retro|brutal/.test(id) || Object.values(p.easing || {}).every((e) => /^(steps|none|linear)/.test(String(e)))) return "rigid";
  if (BOUNCY.has(id) || /elastic|playful/.test(id) || /^(back|elastic|bounce)/.test(String((p.easing || {}).enter))) return "bouncy";
  if (SOFT.has(id) || /soft|luxe|drift|cinematic|liquid/.test(id)) return "soft";
  return "eased";
}

export function curvesFor(p) {
  const t = temperament(p), e = p.easing || {};
  const c = { ...BASE_CURVES };
  if (t === "bouncy") { c.settle = "spring(0.45,14)"; c.launch = e.enter || "back.out(1.7)"; }
  if (t === "soft") { c.settle = "spring(0.8,9)"; c.snap = "power3.out"; c.launch = "cubic-bezier(0.16,0.6,0.2,1)"; }
  if (t === "rigid") { c.settle = "none"; c.snap = e.enter || "steps(4)"; c.drift = e.move && /^steps/.test(e.move) ? e.move : "none"; }
  // the language's own signature eases stay in the family: its enter is the accent, its exit leaves, its move repositions
  if (e.enter && t !== "bouncy" && t !== "rigid") c.snap = e.enter;
  if (e.exit) c.exit = e.exit;
  if (e.move) c.move = e.move;
  return c;
}

export function overshootFor(p) {
  const t = temperament(p);
  if ((p.banned || []).includes("overshoot") || t === "rigid") return { share: 0, max_pct: 0 };
  if (t === "bouncy") return { share: 0.5, max_pct: 25 };
  if (t === "soft") return { share: 0.12, max_pct: 4 };
  return { share: 0.15, max_pct: 8 };
}

// pace: the language's middle reference length against 500 ms; every term of the distance formula scales with it
export function durationsFor(p) {
  const S = (p.tempo && p.tempo.scale_ms) || [200, 300, 450, 700, 1000];
  const pace = Math.min(2.5, Math.max(0.6, (S[2] || 450) / 500));
  const r = (v) => Math.round(v * pace / 10) * 10;
  return { base_ms: r(280), travel_ms: r(550), area_ms: r(150), min_ms: r(350), max_ms: r(1400), jitter: 0.08, exit_k: 0.65, pace: Math.round(pace * 100) / 100 };
}

export function fluentFields(p) {
  const t = temperament(p);
  const each = (p.stagger && p.stagger.each_ms) || 80;
  return {
    durations: p.durations || durationsFor(p),
    curves: p.curves || curvesFor(p),
    mix: p.mix || { min_gestures: 12, min_families: t === "rigid" ? 3 : 4, max_share: t === "rigid" ? 0.5 : 0.4, max_duration_share: 0.4 },
    overlap: { next_at: [0.55, 0.75], trail_frames: [2, 4] },
    stagger: { each_ms: each, amount_max_ms: Math.max(300, Math.min(900, each * 6)), distribution: "power2.in", jitter_frames: 1 },
    overshoot: p.overshoot || overshootFor(p),
    arcs: t === "rigid" ? { min_travel_pct: 100, bow_pct: [0, 0] } : { min_travel_pct: 3, bow_pct: [4, 12] },
    camera: t === "rigid" ? { push_pct: [0, 2], drift_pct_s: [0, 1] } : { push_pct: [1.5, 4], drift_pct_s: [0.5, 1.5] },
  };
}

// ---------------------------------------------------------------- curve shapes (Node side; the browser has the same in rasan-motion.js)
const bez = (x1, y1, x2, y2) => (x) => {
  if (x <= 0) return 0; if (x >= 1) return 1;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 28; i++) { t = (lo + hi) / 2; const bx = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3; if (bx < x) lo = t; else hi = t; }
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
};
const spring = (z, w) => (x) => {
  if (x >= 1) return 1; if (x <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  const raw = (q) => 1 - Math.exp(-z * w * q) * (Math.cos(wd * q) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * q));
  return raw(x) + (1 - raw(1)) * x; // lands exactly on 1 at the end of the tween
};
const P = { power1: 2, quad: 2, power2: 3, cubic: 3, power3: 4, quart: 4, power4: 5, quint: 5, strong: 5 };
export function easeFn(name) {
  const s = String(name || "").trim();
  let m;
  if ((m = s.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/))) return bez(+m[1], +m[2], +m[3], +m[4]);
  if ((m = s.match(/^spring\(\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/))) return spring(Math.min(0.99, +m[1]), +(m[2] || 12));
  if ((m = s.match(/^steps\((\d+)\)$/))) { const n = +m[1]; return (x) => (x >= 1 ? 1 : Math.floor(x * n) / n); }
  if (/^(none|linear)/.test(s)) return (x) => x;
  const pe = parseEase(s), fam = pe.family, dir = pe.dir;
  let inn;
  if (P[fam]) inn = (x) => x ** P[fam];
  else if (fam === "expo") inn = (x) => (x === 0 ? 0 : 2 ** (10 * (x - 1)));
  else if (fam === "sine") inn = (x) => 1 - Math.cos((x * Math.PI) / 2);
  else if (fam === "circ") inn = (x) => 1 - Math.sqrt(1 - x * x);
  else if (fam === "back") { const a = Number((s.match(/\(([\d.]+)/) || [])[1]) || 1.7; inn = (x) => x * x * ((a + 1) * x - a); }
  else if (fam === "elastic") inn = (x) => (x === 0 || x === 1 ? x : -(2 ** (10 * (x - 1))) * Math.sin((x - 1.075) * (2 * Math.PI) / 0.3));
  else if (fam === "bounce") { const out = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; }; inn = (x) => 1 - out(1 - x); }
  else inn = (x) => 1 - (1 - x) ** 2; // GSAP's default power1.out
  if (dir === "in") return inn;
  if (dir === "inout") return (x) => (x < 0.5 ? inn(2 * x) / 2 : 1 - inn(2 - 2 * x) / 2);
  return (x) => 1 - inn(1 - x);
}

// a curve's shape from samples of its progress (0..1 time -> progress): t50, t90, overshoot, stepped, linear.
// The family names are what obey and the gate report; the bounds sit between the curves designers use.
export function shapeOf(sample) {
  const N = sample.length - 1;
  let t50 = 1, t90 = 1, max = -Infinity, lin = true;
  const vals = new Set();
  for (let i = 0; i <= N; i++) {
    const x = i / N, y = sample[i];
    if (t50 === 1 && y >= 0.5) t50 = x;
    if (t90 === 1 && y >= 0.9) t90 = x;
    max = Math.max(max, y);
    if (Math.abs(y - x) > 0.012) lin = false;
    vals.add(Math.round(y * 1000));
  }
  const stepped = vals.size <= Math.min(16, N / 3);
  const family = stepped ? "stepped" : lin ? "linear" : max > 1.005 ? "settle" : t50 < 0.115 ? "snap" : t50 < 0.18 ? "decelerate" : t50 < 0.31 ? "glide" : t50 < 0.42 ? "soft" : t50 <= 0.58 ? "symmetric" : "accelerate";
  return { t50: Math.round(t50 * 1000) / 1000, t90: Math.round(t90 * 1000) / 1000, overshoot_pct: Math.max(0, Math.round((max - 1) * 1000) / 10), family, key: `${family}:${Math.round(t50 * 50) / 50}:${Math.round(t90 * 25) / 25}:${Math.round(Math.max(0, max - 1) * 50) / 50}` };
}
export function sampleEase(fn, n = 200) { return Array.from({ length: n + 1 }, (_, i) => fn(i / n)); }
export const shapeOfName = (name) => shapeOf(sampleEase(easeFn(name)));
