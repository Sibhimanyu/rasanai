// Scene evaluation: (scene, time) -> everything needed to draw that instant. Pure.

import { ease, lerp, clamp } from '../core/ease';
import { evaluatePose } from '../core/motion';
import type { Pose } from '../core/pose';
import { MOTIONS } from '../motions';
import { CHARACTER_RIGS } from '../characters/registry';
import type { CameraKey, SceneDef, Vec3 } from './types';

export interface CameraState {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface EvaluatedScene {
  t: number;
  frame: number;
  characters: { id: string; character: string; pose: Pose; position: Vec3; rotationY: number; scale: number }[];
  camera: CameraState;
  /** Colour overlay from transitions: opacity 0..1. */
  overlay: { color: string; opacity: number };
}

export const frameToTime = (frame: number, fps: number) => frame / fps;
export const sceneFrames = (s: SceneDef) => Math.round(s.duration * s.fps);

export function sampleCamera(keys: CameraKey[], t: number, fallbackFov: number): CameraState {
  if (keys.length === 0) return { position: [0, 1.4, 9], target: [0, 1.1, 0], fov: fallbackFov };
  const first = keys[0], last = keys[keys.length - 1];
  const at = (k: CameraKey): CameraState => ({ position: k.position, target: k.target, fov: k.fov ?? fallbackFov });
  if (t <= first.t) return at(first);
  if (t >= last.t) return at(last);
  let i = 1;
  while (keys[i].t < t) i++;
  const a = keys[i - 1], b = keys[i];
  const u = ease[b.ease ?? 'sineInOut']((t - a.t) / (b.t - a.t));
  const mix = (p: Vec3, q: Vec3): Vec3 => [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target), fov: lerp(a.fov ?? fallbackFov, b.fov ?? fallbackFov, u) };
}

export interface EvaluateOptions {
  portrait?: boolean;
}

export function evaluateScene(scene: SceneDef, t: number, opts: EvaluateOptions = {}): EvaluatedScene {
  const characters = scene.characters.map((c) => {
    const rig = CHARACTER_RIGS[c.character];
    if (!rig) throw new Error(`Unknown character "${c.character}"`);
    return {
      id: c.id,
      character: c.character,
      pose: evaluatePose(c.clips, t, MOTIONS, rig, scene.duration),
      position: c.position ?? [0, 0, 0],
      rotationY: c.rotationY ?? 0,
      scale: c.scale ?? 1,
    };
  });

  let camera = sampleCamera(scene.camera.keys, t, scene.camera.fov);
  if (opts.portrait) {
    // portrait: wider vertical lens and pull back so the width that matters still fits
    const fov = scene.camera.portraitFov ?? 38;
    const k = scene.camera.portraitDistance ?? 1;
    const p = camera.position, g = camera.target;
    camera = {
      fov,
      target: g,
      position: [g[0] + (p[0] - g[0]) * k, g[1] + (p[1] - g[1]) * k, g[2] + (p[2] - g[2]) * k],
    };
  }

  let overlay = { color: '#000000', opacity: 0 };
  for (const tr of scene.transitions ?? []) {
    const u = clamp((t - tr.start) / tr.duration);
    const inside = t >= tr.start && t <= tr.start + tr.duration;
    let o = 0;
    if (tr.type === 'fadeIn' && t <= tr.start + tr.duration) o = 1 - ease.sineInOut(u);
    if (tr.type === 'fadeOut' && t >= tr.start) o = ease.sineInOut(u);
    if ((inside || o > 0) && o > overlay.opacity) overlay = { color: tr.color ?? '#000000', opacity: o };
  }

  return { t, frame: Math.round(t * scene.fps), characters, camera, overlay };
}

/** Basic validation, so a hand-written scene fails loudly instead of rendering wrong. */
export function validateScene(scene: SceneDef): string[] {
  const errors: string[] = [];
  if (!(scene.fps > 0)) errors.push('fps must be > 0');
  if (!(scene.duration > 0)) errors.push('duration must be > 0');
  const ids = new Set<string>();
  for (const c of scene.characters) {
    if (ids.has(c.id)) errors.push(`duplicate character id "${c.id}"`);
    ids.add(c.id);
    if (!CHARACTER_RIGS[c.character]) errors.push(`unknown character "${c.character}"`);
    for (const clip of c.clips) {
      if (!MOTIONS[clip.motion]) errors.push(`${c.id}: unknown motion "${clip.motion}"`);
      if (clip.start < 0 || clip.start > scene.duration) errors.push(`${c.id}: clip "${clip.motion}" starts outside the scene`);
      if (clip.duration != null && clip.duration <= 0) errors.push(`${c.id}: clip "${clip.motion}" has non-positive duration`);
    }
  }
  const keys = scene.camera.keys;
  for (let i = 1; i < keys.length; i++) if (keys[i].t < keys[i - 1].t) errors.push('camera keys must be sorted by time');
  return errors;
}
