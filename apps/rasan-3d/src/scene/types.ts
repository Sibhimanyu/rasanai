// Declarative scene description: plain data, no code. A scene is evaluated at a time t into
// poses, a camera and overlays by evaluateScene() — the same function for studio and renders.

import type { ClipInstance } from '../core/motion';
import type { EaseName } from '../core/ease';
import type { LightDef } from '../stage/lighting';

export type Vec3 = [number, number, number];

export interface CameraKey {
  t: number;
  position: Vec3;
  target: Vec3;
  fov?: number;
  ease?: EaseName;
}

export interface CharacterInstance {
  id: string;
  character: string; // registry key, e.g. 'rasan'
  position?: Vec3;
  rotationY?: number;
  scale?: number;
  clips: ClipInstance[];
}

export interface PropInstance {
  id: string;
  kind: 'clapperboard';
  position: Vec3;
  rotation?: Vec3;
  scale?: number;
  clap?: number;
}

export interface Transition {
  type: 'fadeIn' | 'fadeOut';
  start: number;
  duration: number;
  color?: string;
}

export interface AudioCue {
  src: string; // path under public/
  start: number;
  volume?: number;
}

export interface Background {
  /** CSS colour or gradient drawn behind the transparent canvas. */
  css: string;
  /** Floor shadows on/off. */
  shadows?: boolean;
}

export interface SceneDef {
  id: string;
  name: string;
  fps: number;
  duration: number; // seconds
  background: Background;
  lighting: string | LightDef;
  camera: { fov: number; portraitFov?: number; portraitDistance?: number; keys: CameraKey[] };
  characters: CharacterInstance[];
  props?: PropInstance[];
  transitions?: Transition[];
  audio?: AudioCue[];
}
