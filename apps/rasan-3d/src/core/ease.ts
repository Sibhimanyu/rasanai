// Easing curves and closed-form motion helpers. Everything here is a pure function of time,
// so any frame can be evaluated on its own (no integration, no state carried between frames).

export type Ease = (t: number) => number;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : clamp((v - a) / (b - a)));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: ((t) => t) as Ease,
  in: ((t) => t * t * t) as Ease,
  out: ((t) => 1 - Math.pow(1 - t, 3)) as Ease,
  inOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Ease,
  sineInOut: ((t) => -(Math.cos(Math.PI * t) - 1) / 2) as Ease,
  quadOut: ((t) => 1 - (1 - t) * (1 - t)) as Ease,
  quadIn: ((t) => t * t) as Ease,
  expoOut: ((t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))) as Ease,
  backOut: ((t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }) as Ease,
  backIn: ((t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  }) as Ease,
};

export type EaseName = keyof typeof ease;

/**
 * Damped spring response to a unit step at t=0, closed form (underdamped).
 * Returns 0 at t<=0 and settles to 1. `freq` in Hz, `damping` ratio 0..1.
 */
export function springStep(t: number, freq = 3, damping = 0.35): number {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = clamp(damping, 0.001, 0.999);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
}

/** Decaying wobble after an impulse at t=0: starts at 0, swings, dies out. Peak amplitude ~1. */
export function wobble(t: number, freq = 3, decay = 5): number {
  if (t <= 0) return 0;
  return Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t);
}

/** A keyframe: [time, value, ease into this key]. */
export type Key = [number, number, EaseName?];

/** Sample a keyframe track at time t. Holds the first/last value outside the range. */
export function track(keys: Key[], t: number): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return lerp(v0, v1, ease[e ?? 'inOut'](u));
    }
  }
  return keys[keys.length - 1][1];
}

/** Deterministic hash noise in [-1, 1], smooth in t (value noise with cosine interpolation). */
export function noise1(t: number, seed = 0): number {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(t), f = t - i;
  const u = (1 - Math.cos(f * Math.PI)) / 2;
  return lerp(h(i), h(i + 1), u);
}

/** Volume-preserving squash: given a vertical scale, return the matching horizontal scale. */
export const preserveVolume = (sy: number) => 1 / Math.sqrt(Math.max(0.2, sy));
