// "Action!" — the first demonstration, 8 s at 30 fps.
// 0–2    Rasan hops into frame (squash and stretch)
// 2–3    turns to camera, blinks, brows up
// 3–5    raises the clapperboard and snaps it shut
// 5–6.5  happy double bounce with a cheer
// 6.5–8  settles into a charming idle, looking at camera

import type { SceneDef } from '../types';

const FACE_TRAVEL = 0.62;

export const demoScene: SceneDef = {
  id: 'rasan-demo',
  name: 'Action! (demo)',
  fps: 30,
  duration: 8,
  background: { css: 'radial-gradient(110% 85% at 50% 38%, #fbf8f3 0%, #efe9e0 58%, #ddd5c9 100%)', shadows: true },
  lighting: 'studio',
  camera: {
    fov: 22,
    portraitFov: 40,
    portraitDistance: 0.72,
    keys: [
      { t: 0, position: [-1.1, 1.55, 9.6], target: [-1.0, 1.05, 0] },
      { t: 2.1, position: [-0.15, 1.5, 9.2], target: [0, 1.12, 0], ease: 'sineInOut' },
      { t: 4.4, position: [0.25, 1.45, 8.6], target: [0.0, 1.18, 0], ease: 'sineInOut' },
      { t: 6.2, position: [0.1, 1.42, 8.8], target: [0, 1.15, 0], ease: 'sineInOut' },
      { t: 8, position: [-0.2, 1.42, 8.5], target: [0, 1.15, 0], ease: 'sineInOut' },
    ],
  },
  characters: [
    {
      id: 'rasan',
      character: 'rasan',
      clips: [
        // base layer: breathing all the way through
        { motion: 'idle', start: 0, layer: 0 },

        // 0–2: hop in from the left, facing three-quarters toward travel
        { motion: 'hops', start: 0, duration: 2.0, params: { count: 3, fromX: -3.9, toX: 0, height: 0.42, decay: 0.72 } },
        { motion: 'turn', start: 0, duration: 1.85, params: { from: FACE_TRAVEL, to: FACE_TRAVEL }, layer: 1 },
        { motion: 'look', start: 0, duration: 1.95, params: { x: 0.55, y: -0.15 }, layer: 2 },
        { motion: 'expr.pleased', start: 0, duration: 1.9, fadeOut: 0.3, weight: 0.6, layer: 2 },

        // 2–3: turn to camera, blink, brow flash
        { motion: 'turn', start: 1.85, duration: 0.6, params: { from: FACE_TRAVEL, to: 0 }, layer: 1 },
        { motion: 'look', start: 1.95, duration: 6.05, params: { fromX: 0.55, fromY: -0.15, x: 0, y: 0.05, speed: 0.12 }, layer: 2 },
        { motion: 'blink', start: 2.3, layer: 3 },
        { motion: 'browRaise', start: 2.55, params: { amount: 0.065, hold: 0.3 }, layer: 3 },
        { motion: 'expr.curious', start: 2.45, duration: 0.85, fadeIn: 0.15, fadeOut: 0.25, layer: 2 },

        // 3–5: raise the board proudly, open, snap!
        { motion: 'raiseBoard', start: 3.0, duration: 2.25, params: { height: 0.1, forward: 0.2, x: -0.04, hold: 0 } },
        { motion: 'proud', start: 3.05, duration: 1.8 },
        { motion: 'expr.determined', start: 3.55, duration: 0.75, fadeIn: 0.2, fadeOut: 0.12, weight: 0.85, layer: 2 },
        { motion: 'clap', start: 3.2, duration: 1.75, params: { open: 0.62, snapAt: 1.0 }, layer: 1 },
        { motion: 'expr.pleased', start: 4.25, duration: 0.8, fadeIn: 0.12, fadeOut: 0.2, layer: 2 },

        // 5–6.5: excited happy bounce + cheer
        { motion: 'expr.happy', start: 4.9, duration: 1.75, fadeIn: 0.12, fadeOut: 0.35, layer: 2 },
        { motion: 'bounce', start: 5.05, duration: 1.3, params: { count: 2, height: 0.22, squash: 0.9 } },
        { motion: 'cheer', start: 4.95, duration: 1.55, params: { pumps: 2 }, layer: 1 },

        // 6.5–8: settle; warm look at camera, one last blink
        { motion: 'expr.pleased', start: 6.45, duration: 1.55, fadeIn: 0.45, weight: 0.8, layer: 2 },
        { motion: 'blink', start: 7.25, layer: 3 },
        { motion: 'lean', start: 6.6, duration: 1.4, fadeIn: 0.5, params: { pitch: 0.025, roll: -0.03 } },
      ],
    },
  ],
  transitions: [{ type: 'fadeIn', start: 0, duration: 0.25, color: '#fbf8f3' }],
  audio: [
    { src: 'audio/hop.wav', start: 0.6, volume: 0.35 },
    { src: 'audio/hop.wav', start: 1.27, volume: 0.32 },
    { src: 'audio/hop.wav', start: 1.93, volume: 0.3 },
    { src: 'audio/clap.wav', start: 4.2, volume: 0.9 },
    { src: 'audio/hop.wav', start: 5.56, volume: 0.25 },
    { src: 'audio/hop.wav', start: 6.21, volume: 0.25 },
  ],
};
