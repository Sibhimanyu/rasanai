// Motion clips and the layered evaluator. A motion is a pure function (local time, params,
// rig) -> partial pose. Clips schedule motions on a timeline with weights and fades.
// evaluatePose(clips, t) is pure: the same time always yields the same pose.

import { clampPose, restPose, addPose, setPose, type PartialPose, type Pose } from './pose';
import { clamp, ease } from './ease';
import type { RigSpec } from './rig';

export type BlendMode = 'add' | 'set';

export interface MotionContext {
  rig: RigSpec;
  /** Time since the clip started (seconds, before speed). */
  clipTime: number;
  /** Clip duration in seconds (after speed). */
  clipDuration: number;
  /** Absolute scene time in seconds. */
  sceneTime: number;
}

export interface MotionDef<P = Record<string, number>> {
  name: string;
  description: string;
  /** Natural length in seconds. Looping motions use it as the period. */
  duration: number;
  loop?: boolean;
  mode: BlendMode;
  defaults?: P;
  /** Return channels for `mode`, or { set, add } to do both in one motion. */
  sample: (t: number, params: P, ctx: MotionContext) => PartialPose | MixedOutput;
}

export interface MixedOutput {
  set?: PartialPose;
  add?: PartialPose;
}

const isMixed = (o: object): o is MixedOutput => 'set' in o || 'add' in o;

export interface ClipInstance {
  motion: string;
  /** Start, in seconds of scene time. */
  start: number;
  /** Length in seconds; defaults to motion duration / speed (looping motions: until scene end). */
  duration?: number;
  speed?: number;
  weight?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Lower layers evaluate first; 'set' motions on higher layers override lower ones. */
  layer?: number;
  params?: Record<string, number>;
}

export type MotionLibrary = Record<string, MotionDef<any>>;

export function defineMotion<P extends Record<string, number>>(m: MotionDef<P>): MotionDef<P> {
  return m;
}

export function clipLength(clip: ClipInstance, lib: MotionLibrary, sceneEnd = Infinity): number {
  const m = lib[clip.motion];
  if (!m) throw new Error(`Unknown motion "${clip.motion}"`);
  if (clip.duration != null) return clip.duration;
  if (m.loop) return Math.max(0, sceneEnd - clip.start);
  return m.duration / (clip.speed ?? 1);
}

/** Envelope weight of a clip at scene time t (0 outside the clip). */
export function clipWeight(clip: ClipInstance, len: number, t: number): number {
  const local = t - clip.start;
  if (local < 0 || local > len) return 0;
  const w = clip.weight ?? 1;
  const fi = clip.fadeIn ?? 0, fo = clip.fadeOut ?? 0;
  let e = 1;
  if (fi > 0) e = Math.min(e, ease.sineInOut(clamp(local / fi)));
  if (fo > 0) e = Math.min(e, ease.sineInOut(clamp((len - local) / fo)));
  return w * e;
}

export function evaluatePose(
  clips: ClipInstance[],
  t: number,
  lib: MotionLibrary,
  rig: RigSpec,
  sceneEnd = Infinity,
): Pose {
  const pose = restPose(rig.rest);
  const ordered = clips
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.layer ?? 0) - (b.c.layer ?? 0) || a.i - b.i);
  for (const { c } of ordered) {
    const m = lib[c.motion];
    if (!m) throw new Error(`Unknown motion "${c.motion}"`);
    const len = clipLength(c, lib, sceneEnd);
    const w = clipWeight(c, len, t);
    if (w <= 0) continue;
    const speed = c.speed ?? 1;
    const raw = (t - c.start) * speed;
    const local = m.loop ? raw % m.duration : Math.min(raw, len * speed);
    const params = { ...(m.defaults ?? {}), ...(c.params ?? {}) };
    const out = m.sample(local, params, { rig, clipTime: t - c.start, clipDuration: len * speed, sceneTime: t });
    if (isMixed(out)) {
      if (out.set) setPose(pose, out.set, w);
      if (out.add) addPose(pose, out.add, w);
    } else if (m.mode === 'add') addPose(pose, out, w);
    else setPose(pose, out, w);
  }
  return clampPose(pose);
}
