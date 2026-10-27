// Single-motion showcase scenes, generated from the library, for the studio's animation picker.

import type { SceneDef } from '../types';
import { MOTIONS } from '../../motions';
import { demoScene } from './demo';

const turntableCam = {
  fov: 22,
  keys: [{ t: 0, position: [0, 1.45, 9.4] as [number, number, number], target: [0, 1.12, 0] as [number, number, number] }],
};

export function motionShowcase(name: string): SceneDef {
  const m = MOTIONS[name];
  const len = m.loop ? 6 : Math.max(1.5, m.duration + 0.8);
  return {
    id: `motion-${name}`,
    name,
    fps: 30,
    duration: len,
    background: demoScene.background,
    lighting: 'studio',
    camera: turntableCam,
    characters: [
      {
        id: 'rasan',
        character: 'rasan',
        clips: [
          { motion: 'idle', start: 0 },
          { motion: name, start: 0.3, duration: m.loop ? len - 0.3 : undefined, fadeIn: m.mode === 'set' ? 0.2 : 0, fadeOut: m.mode === 'set' ? 0.25 : 0, layer: 1 },
        ],
      },
    ],
  };
}

export const SCENES: Record<string, SceneDef> = { [demoScene.id]: demoScene };
