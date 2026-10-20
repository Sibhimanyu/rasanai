// Arm and prop motions. Hand targets are offsets from the rig's free rest hand, in body space,
// scaled by the character's reach so they transfer to other mascots.

import { defineMotion } from '../core/motion';
import { clamp, ease, track, wobble } from '../core/ease';
import type { RigSpec } from '../core/rig';

/** Offset from rest hand to a point given relative to the shoulder (units of reach). */
function handOffset(rig: RigSpec, side: 'L' | 'R', dx: number, dy: number, dz: number) {
  const sh = side === 'L' ? rig.shoulderL : rig.shoulderR;
  const rest = side === 'L' ? rig.handRestL : rig.handRestR;
  const r = rig.armReach;
  const sx = side === 'L' ? 1 : -1;
  return [sh[0] + sx * dx * r - rest[0], sh[1] + dy * r - rest[1], sh[2] + dz * r - rest[2]] as const;
}

/** Wave with the right hand (lets go of the board; the left hand keeps it). */
export const wave = defineMotion({
  name: 'wave',
  description: 'Right-hand wave: lets go of the board, waves from the wrist, returns.',
  duration: 1.8,
  mode: 'set',
  defaults: { waves: 3, height: 0.75, side: -1 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const s = p.side > 0 ? 'L' : 'R';
    const [x, y, z] = handOffset(ctx.rig, s, 0.25, p.height, 0.25);
    const up = track([[0, 0], [0.3, 1, 'backOut'], [T - 0.3, 1], [T, 0, 'inOut']], t);
    const osc = Math.sin(clamp((t - 0.25) / (T - 0.55)) * Math.PI * 2 * p.waves) * up;
    const k = s === 'L' ? 'armL' : 'armR';
    return {
      [`${k}.grip`]: 1 - up,
      [`${k}.x`]: x * up + 0.12 * osc * (s === 'L' ? 1 : -1),
      [`${k}.y`]: y * up - 0.03 * Math.abs(osc),
      [`${k}.z`]: z * up,
      [`${k}.bend`]: 0.4 * up,
    } as Record<string, number>;
  },
});

/** Point with the right hand toward a direction (azimuth / elevation in radians). */
export const point = defineMotion({
  name: 'point',
  description: 'Point the right arm toward a direction, with a little jab.',
  duration: 1.4,
  mode: 'set',
  defaults: { azimuth: -0.6, elevation: 0.3 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const dx = Math.sin(-p.azimuth) * Math.cos(p.elevation) * 0.9;
    const dz = Math.cos(p.azimuth) * Math.cos(p.elevation) * 0.9;
    const dy = Math.sin(p.elevation) * 0.9;
    const [x, y, z] = handOffset(ctx.rig, 'R', Math.abs(dx), dy, dz);
    const k = track([[0, 0], [0.12, -0.1, 'inOut'], [0.32, 1.06, 'out'], [0.45, 1, 'inOut'], [T - 0.3, 1], [T, 0, 'inOut']], t);
    const on = clamp(k);
    return { 'armR.grip': 1 - on, 'armR.x': x * k, 'armR.y': y * k, 'armR.z': z * k, 'armR.bend': -0.4 * on };
  },
});

/** Cheer: the free right arm punches up twice. */
export const cheer = defineMotion({
  name: 'cheer',
  description: 'Right arm thrown up in a cheer with two pumps.',
  duration: 1.5,
  mode: 'set',
  defaults: { pumps: 2 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const [x, y, z] = handOffset(ctx.rig, 'R', 0.18, 0.78, 0.3);
    const up = track([[0, 0], [0.18, 1.08, 'out'], [0.3, 1, 'inOut'], [T - 0.35, 1], [T, 0, 'inOut']], t);
    const pump = Math.abs(Math.sin(clamp((t - 0.2) / (T - 0.6)) * Math.PI * p.pumps)) * clamp(up);
    return {
      'armR.grip': 1 - clamp(up),
      'armR.x': x * up,
      'armR.y': y * up - 0.14 * pump,
      'armR.z': z * up,
      'armR.bend': 0.25 * clamp(up) + 0.35 * pump,
      'armR.spread': 0.2 * pump,
    };
  },
});

/** Raise the board up proudly toward the camera, then (optionally) lower it. */
export const raiseBoard = defineMotion({
  name: 'raiseBoard',
  description: 'Lift the clapperboard to show it off, tilted toward the camera.',
  duration: 2,
  mode: 'add',
  defaults: { height: 0.24, forward: 0.16, x: -0.12, hold: 1 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const up = p.hold
      ? track([[0, 0], [0.12, -0.12, 'inOut'], [0.5, 1.06, 'out'], [0.65, 1, 'inOut']], t)
      : track([[0, 0], [0.12, -0.12, 'inOut'], [0.5, 1.06, 'out'], [0.65, 1, 'inOut'], [T - 0.4, 1], [T, 0, 'inOut']], t);
    return {
      'prop.y': p.height * up,
      'prop.z': p.forward * up,
      'prop.x': p.x * up,
      'prop.pitch': -0.12 * up,
      'prop.roll': -0.08 * up,
      'body.pitch': -0.012 * up,
      'body.stretch': 0.012 * clamp(up),
    };
  },
});

/** Open the clapper with the right hand, hold, snap it shut with impact, settle. */
export const clap = defineMotion({
  name: 'clap',
  description: 'Clapper open (anticipation), hold, snap shut with an impact squash and board shake.',
  duration: 1.6,
  mode: 'set',
  defaults: { open: 0.95, snapAt: 0.72, from: 0.45, release: 1 },
  sample: (t, p, ctx) => {
    const T = ctx.clipDuration;
    const sa = p.snapAt;
    const reach = ease.inOut(clamp(t / 0.25));
    const back = p.release ? ease.inOut(clamp((t - (T - 0.45)) / 0.45)) : 0;
    let c: number;
    if (t < sa - 0.06) {
      // open wide (overshoot), then a tiny tremble of tension
      c = track([[0, p.from], [0.12, p.from], [0.42, p.open + 0.04, 'out'], [0.55, p.open, 'inOut']], t);
      c += 0.008 * Math.sin(t * 60) * clamp((t - 0.45) / 0.1);
    } else if (t < sa) {
      c = p.open * (1 - ease.in((t - (sa - 0.06)) / 0.06));
    } else {
      // clapper rebound, tiny
      c = Math.max(0, 0.07 * wobble(t - sa, 7, 14));
    }
    const hit = t - sa;
    const impact = hit >= 0 ? Math.exp(-hit * 9) : 0;
    const shake = wobble(hit, 9, 8);
    const pre = clamp((t - 0.15) / 0.35) * (hit < 0 ? 1 : 0);
    return {
      set: { 'prop.clap': c, 'armL.toClapper': reach * (1 - back) },
      add: {
        'body.stretch': -0.07 * impact * Math.cos(Math.max(0, hit) * 22) + 0.01 * pre,
        'body.pitch': -0.015 * pre + 0.035 * impact,
        'prop.roll': -0.05 * shake,
        'prop.y': -0.03 * impact + 0.025 * pre,
        'hat.lift': 0.035 * impact * Math.cos(Math.max(0, hit) * 16),
        'hat.pitch': -0.05 * shake,
        'eyeL.squint': 0.55 * impact, 'eyeR.squint': 0.55 * impact,
        'browL.raise': 0.03 * pre - 0.03 * impact, 'browR.raise': 0.03 * pre - 0.03 * impact,
        'browL.tilt': -0.25 * impact, 'browR.tilt': -0.25 * impact,
      },
    };
  },
});

/** Generic expressive gesture: both forearms open outward (a "ta-da"). The board stays in the left. */
export const taDa = defineMotion({
  name: 'taDa',
  description: 'Open the free right arm outward in a presenting "ta-da".',
  duration: 1.2,
  mode: 'set',
  defaults: {},
  sample: (t, _p, ctx) => {
    const T = ctx.clipDuration;
    const [x, y, z] = handOffset(ctx.rig, 'R', 0.75, 0.35, 0.4);
    const k = track([[0, 0], [0.25, 1.08, 'out'], [0.4, 1, 'inOut'], [T - 0.3, 1], [T, 0, 'inOut']], t);
    return { 'armR.grip': 1 - clamp(k), 'armR.x': x * k, 'armR.y': y * k, 'armR.z': z * k, 'armR.spread': 0.5 * clamp(k) };
  },
});

/** Hide the prop (both hands free). */
export const handsFree = defineMotion({
  name: 'handsFree',
  description: 'Put the board away: hide it and release both grips.',
  duration: 1,
  mode: 'set',
  defaults: {},
  sample: () => ({ 'prop.visible': 0, 'armL.grip': 0, 'armR.grip': 0 }),
});
