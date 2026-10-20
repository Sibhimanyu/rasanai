// Body motions: breathing, squash, hops, jumps, bounces, walks, leans and turns.
// All additive unless noted, all closed-form in time.

import { defineMotion } from '../core/motion';
import type { PartialPose } from '../core/pose';
import { clamp, ease, lerp, noise1, smoothstep, track, wobble } from '../core/ease';

/** Idle breathing with a slow, organic sway. Loop. */
export const idle = defineMotion({
  name: 'idle',
  description: 'Breathing, a slow sway and a lazy hat drift. Loop.',
  duration: 12,
  loop: true,
  mode: 'add',
  defaults: { amount: 1 },
  sample: (_t, { amount }, ctx) => {
    const t = ctx.sceneTime; // phase from scene time so idles line up when they overlap
    const breath = Math.sin(t * Math.PI * 2 * 0.33);
    return {
      'body.stretch': 0.014 * breath * amount,
      'body.roll': 0.012 * noise1(t * 0.35, 1) * amount,
      'body.pitch': 0.008 * noise1(t * 0.3, 2) * amount,
      'body.twist': 0.02 * noise1(t * 0.2, 3) * amount,
      'hat.roll': 0.006 * noise1(t * 0.4 + 2, 4) * amount,
      'hat.lift': -0.004 * breath * amount,
      'prop.y': 0.008 * Math.sin(t * Math.PI * 2 * 0.33 - 0.6) * amount,
      'armL.y': 0.008 * Math.sin(t * Math.PI * 2 * 0.33 - 0.6) * amount,
      'armR.y': 0.008 * Math.sin(t * Math.PI * 2 * 0.33 - 0.6) * amount,
    };
  },
});

/** One squash-and-recover pulse (an impact, a hiccup, a beat). */
export const squash = defineMotion({
  name: 'squash',
  description: 'A quick squash that springs back with a wobble.',
  duration: 0.7,
  mode: 'add',
  defaults: { amount: 0.12 },
  sample: (t, { amount }) => {
    const hit = t < 0.06 ? -amount * ease.out(t / 0.06) : -amount * Math.cos((t - 0.06) * 18) * Math.exp(-(t - 0.06) * 7);
    return { 'body.stretch': hit, 'hat.lift': -hit * 0.12, 'prop.y': hit * 0.15 };
  },
});

/**
 * Hop curve for one hop of length T at local time t: anticipation squash, takeoff stretch,
 * a parabolic arc, landing squash and a damped recovery. Returns air progress too.
 */
export function hopShape(t: number, T: number, height: number, squashAmt = 1) {
  const u = t / T;
  const a0 = 0.2, take = 0.28, land = 0.78;
  let y = 0, stretch = 0, air = 0, hatLag = 0, pitch = 0;
  if (u < a0) {
    // anticipation: sink
    const k = ease.inOut(u / a0);
    stretch = -0.13 * k * squashAmt;
    pitch = -0.04 * k;
  } else if (u < take) {
    // launch: snap from squash to stretch while still on the ground
    const k = ease.out((u - a0) / (take - a0));
    stretch = lerp(-0.13 * squashAmt, 0.16 * squashAmt, k);
    y = height * 0.08 * k * k;
    pitch = lerp(-0.04, 0.08, k);
    hatLag = -0.025 * k;
  } else if (u < land) {
    const k = (u - take) / (land - take);
    y = height * ((1 - Math.pow(2 * k - 1, 2)) + 0.08 * (1 - k));
    air = k;
    // stretch relaxes at the apex and extends again on the fall
    stretch = squashAmt * (0.16 * (1 - smoothstep(0, 0.45, k)) + 0.03 + 0.07 * smoothstep(0.6, 1, k));
    pitch = 0.08 * (1 - k) - 0.03 * k;
    hatLag = -0.025 * (1 - k) + 0.02 * Math.sin(Math.PI * k);
  } else {
    // landing: contact squash then damped wobble
    const k = (u - land) * T;
    const ring = -0.17 * squashAmt * Math.exp(-k * 7.5) * Math.cos(k * 16);
    stretch = ring;
    pitch = -0.05 * Math.exp(-k * 6) * Math.cos(k * 10);
    hatLag = -0.035 * Math.exp(-k * 6) * Math.cos(k * 14 + 0.4);
    air = 1;
  }
  return { y: Math.max(0, y), stretch, air, hatLag, pitch };
}

/** A run of hops travelling from (fromX, fromZ) to (toX, toZ). */
export const hops = defineMotion({
  name: 'hops',
  description: 'Playful hops travelling between two floor points, with anticipation and landing squash.',
  duration: 2,
  mode: 'add',
  defaults: { count: 3, fromX: -2.5, toX: 0, fromZ: 0, toZ: 0, height: 0.32, squash: 1, decay: 0.75 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration / p.count;
    const i = Math.min(p.count - 1, Math.floor(t / T));
    const lt = t - i * T;
    const hgt = p.height * Math.pow(p.decay, i);
    const h = hopShape(lt, T, hgt, p.squash * (0.8 + 0.2 * Math.pow(p.decay, i)));
    // travel only while airborne, so each landing plants
    const prog = clamp((i + ease.inOut(h.air)) / p.count);
    const dir = Math.sign(p.toX - p.fromX) || 1;
    return {
      'root.x': lerp(p.fromX, p.toX, prog),
      'root.z': lerp(p.fromZ, p.toZ, prog),
      'root.y': h.y,
      'body.stretch': h.stretch,
      'body.pitch': h.pitch * 0.8,
      'body.roll': -dir * 0.03 * Math.sin(Math.PI * h.air) * 0,
      'hat.lift': h.hatLag,
      'hat.pitch': -h.hatLag * 1.2,
      'prop.y': -h.hatLag * 0.8,
      'armL.y': -h.hatLag * 0.6,
      'armR.y': -h.hatLag * 0.6,
      'footL.pitch': 0.3 * Math.sin(Math.PI * h.air) * (h.y > 0 ? 1 : 0),
      'footR.pitch': 0.3 * Math.sin(Math.PI * h.air) * (h.y > 0 ? 1 : 0),
      'footL.y': 0.03 * Math.sin(Math.PI * h.air),
      'footR.y': 0.03 * Math.sin(Math.PI * h.air),
    };
  },
});

/** Hops in place. Loop-friendly when count matches the loop. */
export const bounce = defineMotion({
  name: 'bounce',
  description: 'Excited bounces in place.',
  duration: 1.2,
  mode: 'add',
  defaults: { count: 2, height: 0.18, squash: 0.8 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration / p.count;
    const i = Math.min(p.count - 1, Math.floor(t / T));
    const h = hopShape(t - i * T, T, p.height, p.squash);
    return {
      'root.y': h.y,
      'body.stretch': h.stretch,
      'body.pitch': h.pitch * 0.4,
      'hat.lift': h.hatLag * 1.2,
      'hat.roll': h.hatLag * 0.8,
      'prop.y': -h.hatLag * 0.6,
    };
  },
});

/** One big jump with a long anticipation. */
export const jump = defineMotion({
  name: 'jump',
  description: 'A big jump: deep anticipation, a tall arc, heavy landing.',
  duration: 1.4,
  mode: 'add',
  defaults: { height: 0.8, squash: 1.25 },
  sample: (t, p, ctx) => {
    const h = hopShape(t, ctx.clipDuration, p.height, p.squash);
    return {
      'root.y': h.y,
      'body.stretch': h.stretch,
      'body.pitch': h.pitch * 0.5,
      'hat.lift': h.hatLag * 1.6,
      'prop.y': -h.hatLag,
      'armL.y': -h.hatLag * 2,
      'armR.y': -h.hatLag * 2,
    };
  },
});

/** Small expressive steps: feet lift alternately, the body bobs and rolls over each foot. */
export const walk = defineMotion({
  name: 'walk',
  description: 'Waddling steps in the facing direction over a distance.',
  duration: 2,
  mode: 'add',
  defaults: { steps: 6, distance: 1.2, heading: 0, stepHeight: 0.07 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const ph = (t / T) * p.steps; // one step per unit
    const env = smoothstep(0, 0.25, t) * smoothstep(0, 0.25, T - t);
    const side = Math.floor(ph) % 2 === 0 ? 1 : -1;
    const f = ph - Math.floor(ph);
    const lift = Math.sin(Math.PI * f) * p.stepHeight * env;
    const d = p.distance * ease.inOut(clamp(t / T));
    const out: PartialPose = {
      'root.x': Math.sin(p.heading) * d,
      'root.z': Math.cos(p.heading) * d,
      'body.roll': 0.06 * side * Math.sin(Math.PI * f) * env,
      'body.stretch': -0.03 * Math.cos(Math.PI * 2 * f) * env,
      'body.lift': 0.025 * Math.abs(Math.sin(Math.PI * f)) * env,
      'body.twist': 0.05 * side * Math.sin(Math.PI * f) * env,
      'hat.roll': -0.03 * side * Math.sin(Math.PI * f - 0.5) * env,
      'prop.roll': -0.03 * side * Math.sin(Math.PI * f - 0.6) * env,
    };
    if (side > 0) { out['footL.y'] = lift; out['footL.pitch'] = -lift * 2; out['footL.z'] = (f - 0.5) * 0.12 * env; }
    else { out['footR.y'] = lift; out['footR.pitch'] = -lift * 2; out['footR.z'] = (f - 0.5) * 0.12 * env; }
    return out;
  },
});

/** Turn to a heading (absolute yaw) with anticipation and a little overshoot. */
export const turn = defineMotion({
  name: 'turn',
  description: 'Turn the whole body to face a heading, with a wind-up and overshoot.',
  duration: 0.6,
  mode: 'set',
  defaults: { from: 0, to: 0 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const k = t / T;
    const wind = -0.08 * Math.sin(Math.PI * clamp(k / 0.25)) * Math.sign(p.to - p.from);
    const main = ease.backOut(clamp((k - 0.15) / 0.85));
    return { 'root.yaw': p.from + (p.to - p.from) * main + wind };
  },
});

/** Lean in a direction and hold (use clip fades to blend in/out). */
export const lean = defineMotion({
  name: 'lean',
  description: 'Lean forward/back (pitch) and sideways (roll), held.',
  duration: 1,
  mode: 'add',
  defaults: { pitch: 0.1, roll: 0 },
  sample: (t, p) => {
    const k = ease.backOut(clamp(t / 0.35));
    return { 'body.pitch': p.pitch * k, 'body.roll': p.roll * k, 'hat.pitch': -p.pitch * 0.15 * k };
  },
});

/** Stretch tall with pride (chest out), slowly settling. */
export const proud = defineMotion({
  name: 'proud',
  description: 'Stand tall and puff up.',
  duration: 1.5,
  mode: 'add',
  defaults: { amount: 1 },
  sample: (t, p) => {
    const k = track([[0, 0], [0.25, 1, 'backOut'], [1.5, 0.75, 'sineInOut']], t) * p.amount;
    return { 'body.stretch': 0.025 * k, 'body.pitch': -0.02 * k, 'hat.lift': 0.005 * k };
  },
});

export const wobbleOnce = wobble; // re-export for authoring convenience
