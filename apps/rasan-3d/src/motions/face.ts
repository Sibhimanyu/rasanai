// Face motions: blinks, gaze, brow gestures and expression holds.

import { defineMotion, type MotionDef } from '../core/motion';
import type { PartialPose } from '../core/pose';
import { clamp, ease, track } from '../core/ease';
import { EXPRESSIONS, type ExpressionName } from '../expressions/expressions';

/** Blink curve: fast close, a 1-frame hold, slower open. */
export function blinkCurve(t: number, len = 0.2) {
  const u = t / len;
  if (u <= 0 || u >= 1) return 0;
  return u < 0.35 ? ease.quadIn(u / 0.35) : u < 0.45 ? 1 : 1 - ease.quadOut((u - 0.45) / 0.55);
}

export const blink = defineMotion({
  name: 'blink',
  description: 'A single blink. `double` = 1 for a double blink.',
  duration: 0.42,
  mode: 'add',
  defaults: { double: 0, len: 0.2 },
  sample: (t, p) => {
    const b = Math.max(blinkCurve(t, p.len), p.double ? blinkCurve(t - p.len - 0.04, p.len) : 0);
    return { 'eyeL.blink': b, 'eyeR.blink': b, 'browL.raise': -0.008 * b, 'browR.raise': -0.008 * b };
  },
});

/** Natural blinking at deterministic, irregular intervals. Loop. */
export const blinkCycle = defineMotion({
  name: 'blinkCycle',
  description: 'Background blinking every 2.5-4.5 s (deterministic). Loop.',
  duration: 20,
  loop: true,
  mode: 'add',
  defaults: { seed: 1 },
  sample: (_t, p, ctx) => {
    const t = ctx.sceneTime;
    let at = 0.8 + p.seed * 0.37, i = 0, b = 0;
    while (at < t + 1 && i < 200) {
      b = Math.max(b, blinkCurve(t - at));
      const r = Math.abs(Math.sin((i + 1) * 12.9898 + p.seed * 78.233)) % 1;
      at += 2.5 + 2 * r;
      i++;
    }
    return { 'eyeL.blink': b, 'eyeR.blink': b };
  },
});

/** Look toward a gaze target (-1..1) with a quick saccade, hold, then return if `back`. */
export const look = defineMotion({
  name: 'look',
  description: 'Shift gaze to (x, y) with a quick saccade and tiny overshoot.',
  duration: 1,
  mode: 'set',
  defaults: { x: 0, y: 0, fromX: 0, fromY: 0, speed: 0.14 },
  sample: (t, p) => {
    const k = ease.backOut(clamp(t / p.speed));
    return { 'eyes.lookX': p.fromX + (p.x - p.fromX) * k, 'eyes.lookY': p.fromY + (p.y - p.fromY) * k };
  },
});

/** Brow flash: raise both brows, hold, relax. */
export const browRaise = defineMotion({
  name: 'browRaise',
  description: 'Raise both brows (an eyebrow flash), hold, relax.',
  duration: 1,
  mode: 'add',
  defaults: { amount: 0.06, hold: 0.45 },
  sample: (t, p) => {
    const k = track([[0, 0], [0.12, 1.12, 'out'], [0.2, 1, 'inOut'], [0.2 + p.hold, 1], [0.2 + p.hold + 0.3, 0, 'inOut']], t);
    return {
      'browL.raise': p.amount * k, 'browR.raise': p.amount * k,
      'browL.curve': 0.3 * k, 'browR.curve': 0.3 * k,
      'eyes.wide': 0.12 * k,
      'body.stretch': 0.012 * k,
    };
  },
});

/** Hold a named expression. Blend with clip fadeIn/fadeOut. */
function expressionMotion(name: ExpressionName): MotionDef {
  const target = EXPRESSIONS[name] as PartialPose;
  return {
    name: `expr.${name}`,
    description: `Hold the "${name}" expression.`,
    duration: 1,
    mode: 'set',
    sample: () => target,
  };
}

export const expressionMotions = Object.fromEntries(
  (Object.keys(EXPRESSIONS) as ExpressionName[]).map((n) => [`expr.${n}`, expressionMotion(n)]),
) as Record<string, MotionDef>;
