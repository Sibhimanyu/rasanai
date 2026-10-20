// Facial expressions as pose presets (eyes + brows + a hint of body attitude).
// Applied with 'set' blending, so they cross-fade with clip fades.

import type { PartialPose } from '../core/pose';

const both = (k: 'blink' | 'squint' | 'happy', v: number): PartialPose => ({ [`eyeL.${k}`]: v, [`eyeR.${k}`]: v });
const brows = (raise: number, tilt: number, curve: number, asym = 0): PartialPose => ({
  'browL.raise': raise + asym, 'browR.raise': raise - asym,
  'browL.tilt': tilt, 'browR.tilt': tilt,
  'browL.curve': curve, 'browR.curve': curve,
});

export const EXPRESSIONS = {
  neutral: { ...brows(0, 0, 0), ...both('squint', 0), ...both('happy', 0), 'eyes.wide': 0 },
  happy: { ...brows(0.035, -0.05, 0.4), ...both('happy', 1), ...both('squint', 0), 'eyes.wide': 0 },
  pleased: { ...brows(0.025, -0.04, 0.3), ...both('squint', 0.35), ...both('happy', 0), 'eyes.wide': 0 },
  curious: { ...brows(0.03, 0.05, 0.15, 0.035), ...both('squint', 0), ...both('happy', 0), 'eyes.wide': 0.12 },
  surprised: { ...brows(0.075, 0.08, 0.6), ...both('squint', 0), ...both('happy', 0), 'eyes.wide': 0.35 },
  confused: { ...brows(0.01, 0.2, -0.2, 0.05), 'browR.tilt': -0.25, 'eyeL.squint': 0.25, 'eyeR.squint': 0, ...both('happy', 0), 'eyes.wide': 0 },
  determined: { ...brows(-0.03, -0.35, -0.3), ...both('squint', 0.4), ...both('happy', 0), 'eyes.wide': 0 },
} satisfies Record<string, PartialPose>;

export type ExpressionName = keyof typeof EXPRESSIONS;
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS) as ExpressionName[];
